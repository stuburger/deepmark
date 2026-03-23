import { db } from "@/db"
import { logger } from "@/lib/logger"
import { getFileBase64 } from "@/lib/s3"
import { GoogleGenAI, Type } from "@google/genai"
import { logStudentPaperEvent } from "@mcp-gcse/db"
import { Resource } from "sst"

export type AnswerRegion = {
	/** 1-indexed page order matching StudentPaperJob.pages[].order */
	page: number
	/** [yMin, xMin, yMax, xMax] normalised 0–1000, same coordinate system as OCR features */
	box: [number, number, number, number]
}

export type PageEntry = { key: string; order: number; mime_type: string }

type GeminiRegionResponse = {
	regions: Array<{
		question_id: string
		answer_region: [number, number, number, number]
		found: boolean
	}>
}

const REGION_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		regions: {
			type: Type.ARRAY,
			items: {
				type: Type.OBJECT,
				properties: {
					question_id: { type: Type.STRING },
					answer_region: {
						type: Type.ARRAY,
						items: { type: Type.INTEGER },
					},
					found: { type: Type.BOOLEAN },
				},
				required: ["question_id", "answer_region", "found"],
			},
		},
	},
	required: ["regions"],
}

const TAG = "gemini-region"

export type AttributeAnswerRegionsArgs = {
	questions: Array<{
		question_id: string
		question_number: string
		question_text: string
		is_mcq: boolean
	}>
	pages: PageEntry[]
	s3Bucket: string
	jobId: string
}

/**
 * Calls Gemini Vision once per image page (all pages in parallel) to identify
 * where each answer is written. Rows are written to `student_paper_answer_regions`
 * as each page resolves, so the frontend can poll for them incrementally.
 *
 * Runs fire-and-forget alongside the grading pipeline — grading no longer
 * waits for this to complete before writing ocr_complete status.
 * On any per-page failure the page is skipped gracefully; grading is unaffected.
 */
export async function attributeAnswerRegions({
	questions,
	pages,
	s3Bucket,
	jobId,
}: AttributeAnswerRegionsArgs): Promise<void> {
	if (questions.length === 0) return

	const imagePages = pages.filter((p) => p.mime_type !== "application/pdf")
	if (imagePages.length === 0) return

	const gemini = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })

	const questionsText = questions
		.map((q) => {
			const hint = q.is_mcq
				? " [MCQ — look for a circled, ticked option letter or standalone letter A/B/C/D/E/Etc]"
				: ""
			return `Q${q.question_number} (id: ${q.question_id})${hint}: ${q.question_text.slice(0, 150)}`
		})
		.join("\n")

	// Build a lookup so we can attach question_number to each DB row.
	const questionNumberById = new Map(
		questions.map((q) => [q.question_id, q.question_number]),
	)

	// Accumulates across parallel page handlers — safe because JS is single-threaded.
	// biome-ignore lint/style/useConst: mutated inside async lambdas
	let totalLocated = 0

	await Promise.all(
		imagePages.map(async (page): Promise<void> => {
			let imageBase64: string
			try {
				imageBase64 = await getFileBase64(s3Bucket, page.key)
			} catch (err) {
				logger.error(TAG, "Failed to fetch page image for region attribution", {
					jobId,
					pageOrder: page.order,
					error: String(err),
				})
				return
			}

			const mimeType = page.key.endsWith(".png") ? "image/png" : "image/jpeg"

			try {
				const response = await gemini.models.generateContent({
					model: "gemini-2.5-flash",
					contents: [
						{
							role: "user",
							parts: [
								{ inlineData: { data: imageBase64, mimeType } },
								{
									text: `You are examining a student's handwritten exam script page.

For each question below, identify the region of the page where the student has written their answer. Draw a single bounding box that encompasses the ENTIRE answer for that question — including all written lines, corrections, and crossed-out text.

If a question was not answered on this page, set found to false and use [0,0,0,0] for the answer_region.

Questions:
${questionsText}

Return bounding box coordinates as [yMin, xMin, yMax, xMax] normalised 0–1000.`,
								},
							],
						},
					],
					config: {
						responseMimeType: "application/json",
						responseSchema: REGION_SCHEMA,
						temperature: 0.1,
					},
				})

				const responseText = response.text
				if (!responseText) return

				const geminiResult = JSON.parse(responseText) as GeminiRegionResponse
				const found = (geminiResult.regions ?? []).filter((r) => r.found)

				logger.info(TAG, "Region attribution complete for page", {
					jobId,
					pageOrder: page.order,
					found: found.length,
					total: geminiResult.regions?.length ?? 0,
				})

				if (found.length === 0) return

				// Write all found regions for this page in one DB call so they
				// become visible to the frontend poller as soon as possible.
				await db.studentPaperAnswerRegion.createMany({
					data: found.map((region) => ({
						job_id: jobId,
						question_id: region.question_id,
						question_number: questionNumberById.get(region.question_id) ?? "",
						page_order: page.order,
						box: region.answer_region,
					})),
					skipDuplicates: true,
				})

				// JS is single-threaded so this increment is race-free.
				totalLocated += found.length
			} catch (err) {
				logger.error(TAG, "Gemini Vision region attribution failed for page", {
					jobId,
					pageOrder: page.order,
					error: String(err),
				})
			}
		}),
	)

	void logStudentPaperEvent(db, jobId, {
		type: "region_attribution_complete",
		at: new Date().toISOString(),
		questions_located: totalLocated,
	})
}

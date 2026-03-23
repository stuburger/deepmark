import { logger } from "@/lib/logger"
import { getFileBase64 } from "@/lib/s3"
import { GoogleGenAI, Type } from "@google/genai"
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

/**
 * Calls Gemini Vision once per image page to identify where each written answer
 * is located. Runs concurrently with the grading loop so it adds minimal latency.
 *
 * Returns a map of question_id → AnswerRegion[].
 * On any per-page failure the page is skipped gracefully; grading is unaffected.
 */
export async function attributeAnswerRegions(
	questions: Array<{
		question_id: string
		question_number: string
		question_text: string
		is_mcq: boolean
	}>,
	pages: PageEntry[],
	s3Bucket: string,
	jobId: string,
): Promise<Map<string, AnswerRegion[]>> {
	const result = new Map<string, AnswerRegion[]>()

	if (questions.length === 0) return result

	const imagePages = pages.filter((p) => p.mime_type !== "application/pdf")
	if (imagePages.length === 0) return result

	const gemini = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })

	const questionsText = questions
		.map((q) => {
			const hint = q.is_mcq
				? " [MCQ — look for a circled, ticked option letter or standalone letter A/B/C/D/E/Etc]"
				: ""
			return `Q${q.question_number} (id: ${q.question_id})${hint}: ${q.question_text.slice(0, 150)}`
		})
		.join("\n")

	for (const page of imagePages) {
		let imageBase64: string
		try {
			imageBase64 = await getFileBase64(s3Bucket, page.key)
		} catch (err) {
			logger.error(TAG, "Failed to fetch page image for region attribution", {
				jobId,
				pageOrder: page.order,
				error: String(err),
			})
			continue
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
			if (!responseText) continue

			const geminiResult = JSON.parse(responseText) as GeminiRegionResponse
			const found = (geminiResult.regions ?? []).filter((r) => r.found)

			logger.info(TAG, "Region attribution complete for page", {
				jobId,
				pageOrder: page.order,
				found: found.length,
				total: geminiResult.regions?.length ?? 0,
			})

			for (const region of found) {
				const existing = result.get(region.question_id) ?? []
				existing.push({ page: page.order, box: region.answer_region })
				result.set(region.question_id, existing)
			}
		} catch (err) {
			logger.error(TAG, "Gemini Vision region attribution failed for page", {
				jobId,
				pageOrder: page.order,
				error: String(err),
			})
		}
	}

	return result
}

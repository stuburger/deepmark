import { db } from "@/db"
import { logger } from "@/lib/logger"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { GoogleGenAI, Type } from "@google/genai"
import { Resource } from "sst"

const TAG = "refine-answer-regions"
const s3 = new S3Client({})
const client = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })

interface SqsRecord {
	messageId: string
	body: string
}

interface SqsEvent {
	Records: SqsRecord[]
}

type PageSegment = {
	page_number: number
	scan_page_id?: string
	segment_text: string
	bounding_boxes: unknown[]
}

type AnswerRegion = {
	page_number: number
	scan_page_id: string
	answer_region: [number, number, number, number]
}

type QuestionForPage = {
	question_id: string
	question_part_id: string | null
	// e.g. "1", "2a", "2b" — what Gemini sees on the paper
	display_number: string
	question_text: string
}

type RegionResult = {
	question_id: string
	question_part_id: string | null
	answer_region: [number, number, number, number]
	found: boolean
}

type GeminiRegionResponse = {
	regions: Array<{
		question_id: string
		question_part_id: string | null
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
					question_part_id: { type: Type.STRING, nullable: true },
					// [yMin, xMin, yMax, xMax] normalized 0–1000
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

export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []

	for (const record of event.Records) {
		const messageId = record.messageId
		let scanSubmissionId: string | undefined

		try {
			const body = JSON.parse(record.body) as { scan_submission_id: string }
			scanSubmissionId = body.scan_submission_id

			if (!scanSubmissionId) {
				logger.warn(TAG, "Message missing scan_submission_id", { messageId })
				continue
			}

			logger.info(TAG, "Region refinement job received", {
				scanSubmissionId,
				messageId,
			})

			const submission = await db.scanSubmission.findUniqueOrThrow({
				where: { id: scanSubmissionId },
				include: {
					pages: { orderBy: { page_number: "asc" } },
					extracted_answers: true,
					exam_paper: {
						include: {
							sections: {
								orderBy: { order: "asc" },
								include: {
									exam_section_questions: {
										orderBy: { order: "asc" },
										include: {
											question: {
												include: {
													question_parts: { orderBy: { order: "asc" } },
												},
											},
										},
									},
								},
							},
						},
					},
				},
			})

			if (submission.extracted_answers.length === 0) {
				logger.info(TAG, "No extracted answers — skipping refinement", {
					scanSubmissionId,
				})
				continue
			}

			// Build display number map: question_id → "1", "2"; question_id:part_id → "1a", "2b"
			const displayNumberMap = new Map<string, string>()
			const questionTextMap = new Map<string, string>()
			let qIndex = 1
			for (const section of submission.exam_paper.sections) {
				for (const esq of section.exam_section_questions) {
					const q = esq.question
					const qNum = String(qIndex)
					displayNumberMap.set(q.id, qNum)
					questionTextMap.set(q.id, q.text)
					for (const part of q.question_parts ?? []) {
						displayNumberMap.set(
							`${q.id}:${part.id}`,
							`${qNum}${part.part_label}`,
						)
						questionTextMap.set(`${q.id}:${part.id}`, part.text)
					}
					qIndex++
				}
			}

			// Process each page independently
			for (const page of submission.pages) {
				// Find extracted answers that have a segment on this page
				const answersOnPage = submission.extracted_answers.filter((ext) => {
					const segments = (ext.page_segments as PageSegment[] | null) ?? []
					return segments.some((s) => s.page_number === page.page_number)
				})

				if (answersOnPage.length === 0) {
					logger.info(TAG, "No answers on page — skipping", {
						scanSubmissionId,
						pageNumber: page.page_number,
					})
					continue
				}

				// Fetch the page image from S3
				let imageBase64: string
				try {
					const getCmd = new GetObjectCommand({
						Bucket: page.s3_bucket,
						Key: page.s3_key,
					})
					const response = await s3.send(getCmd)
					const body = await response.Body?.transformToByteArray()
					if (!body?.length) {
						throw new Error("Empty S3 object")
					}
					imageBase64 = Buffer.from(body).toString("base64")
				} catch (err) {
					logger.error(TAG, "Failed to fetch page image from S3", {
						scanSubmissionId,
						pageNumber: page.page_number,
						s3Key: page.s3_key,
						error: String(err),
					})
					continue
				}

				// Build question list for the Gemini prompt
				const questionsForPage: QuestionForPage[] = answersOnPage.map((ext) => {
					const mapKey = ext.question_part_id
						? `${ext.question_id}:${ext.question_part_id}`
						: ext.question_id
					return {
						question_id: ext.question_id,
						question_part_id: ext.question_part_id,
						display_number: displayNumberMap.get(mapKey) ?? "?",
						question_text: questionTextMap.get(mapKey) ?? "",
					}
				})

				const mimeType = page.s3_key.endsWith(".png")
					? "image/png"
					: "image/jpeg"
				const questionsText = questionsForPage
					.map(
						(q) =>
							`Q${q.display_number} (id: ${q.question_id}${q.question_part_id ? `, part_id: ${q.question_part_id}` : ""}): ${q.question_text}`,
					)
					.join("\n")

				logger.info(TAG, "Calling Gemini Vision for region refinement", {
					scanSubmissionId,
					pageNumber: page.page_number,
					questionCount: questionsForPage.length,
				})

				let geminiResult: GeminiRegionResponse
				try {
					const response = await client.models.generateContent({
						model: "gemini-2.5-flash",
						contents: [
							{
								role: "user",
								parts: [
									{
										inlineData: {
											data: imageBase64,
											mimeType,
										},
									},
									{
										text: `You are examining a student's handwritten exam script page.

For each question below, identify the region of the page where the student has written their answer. Draw a single bounding box that encompasses the ENTIRE answer for that question — including all written lines, even if sparse, crossed out, or spread across the page.

If a question was not answered on this page, set found to false and use [0,0,0,0] for the answer_region.

Questions answered on this page:
${questionsText}

Return bounding box coordinates as [yMin, xMin, yMax, xMax] normalized 0–1000.`,
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
					if (!responseText) {
						throw new Error("No response from Gemini")
					}
					geminiResult = JSON.parse(responseText) as GeminiRegionResponse
				} catch (err) {
					logger.error(TAG, "Gemini Vision call failed for page", {
						scanSubmissionId,
						pageNumber: page.page_number,
						error: String(err),
					})
					continue
				}

				const foundRegions = (geminiResult.regions ?? []).filter(
					(r): r is RegionResult => r.found === true,
				)

				logger.info(TAG, "Regions found by Gemini", {
					scanSubmissionId,
					pageNumber: page.page_number,
					total: geminiResult.regions?.length ?? 0,
					found: foundRegions.length,
				})

				// Write answer_region back to each ExtractedAnswer
				for (const region of foundRegions) {
					const ext = answersOnPage.find(
						(e) =>
							e.question_id === region.question_id &&
							(e.question_part_id ?? null) ===
								(region.question_part_id ?? null),
					)
					if (!ext) continue

					const existing = (ext.answer_regions as AnswerRegion[] | null) ?? []

					// Replace any existing region for this page or append
					const updated: AnswerRegion[] = [
						...existing.filter((r) => r.page_number !== page.page_number),
						{
							page_number: page.page_number,
							scan_page_id: page.id,
							answer_region: region.answer_region,
						},
					]

					await db.extractedAnswer.update({
						where: { id: ext.id },
						data: { answer_regions: updated as unknown as object },
					})
				}
			}

			logger.info(TAG, "Region refinement complete", { scanSubmissionId })
		} catch (err) {
			logger.error(TAG, "Region refinement job failed", {
				scanSubmissionId,
				error: String(err),
			})
			failures.push({ itemIdentifier: messageId })
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}

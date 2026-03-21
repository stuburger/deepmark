import { db } from "@/db"
import { logger } from "@/lib/logger"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { GoogleGenAI, Type } from "@google/genai"
import { ScanStatus } from "@mcp-gcse/db"
import { Resource } from "sst"

const TAG = "extract-answers"
const client = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })
const sqs = new SQSClient({})

interface BoundingBox {
	box_2d: number[]
	label: string
	feature_type: string
}

interface PageSegment {
	page_number: number
	segment_text: string
	bounding_boxes: BoundingBox[]
}

interface ExtractionItem {
	question_id: string
	question_part_id: string | null
	extracted_text: string
	confidence?: number
	page_segments: PageSegment[]
}

interface ExtractionResult {
	extractions: ExtractionItem[]
}

const EXTRACTION_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		extractions: {
			type: Type.ARRAY,
			items: {
				type: Type.OBJECT,
				properties: {
					question_id: { type: Type.STRING },
					question_part_id: { type: Type.STRING, nullable: true },
					// Full concatenated text across all pages — used for grading
					extracted_text: { type: Type.STRING },
					confidence: { type: Type.NUMBER },
					page_segments: {
						type: Type.ARRAY,
						items: {
							type: Type.OBJECT,
							properties: {
								page_number: { type: Type.INTEGER },
								segment_text: { type: Type.STRING },
								bounding_boxes: {
									type: Type.ARRAY,
									items: {
										type: Type.OBJECT,
										properties: {
											box_2d: {
												type: Type.ARRAY,
												items: { type: Type.INTEGER },
											},
											label: { type: Type.STRING },
											feature_type: { type: Type.STRING },
										},
										required: ["box_2d", "label", "feature_type"],
									},
								},
							},
							required: ["page_number", "segment_text", "bounding_boxes"],
						},
					},
				},
				required: ["question_id", "extracted_text", "page_segments"],
			},
		},
	},
	required: ["extractions"],
}

interface SqsRecord {
	messageId: string
	body: string
}

interface SqsEvent {
	Records: SqsRecord[]
}

export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []

	for (const record of event.Records) {
		const messageId = record.messageId
		try {
			logger.info(TAG, "Message received", { messageId })
			const body = JSON.parse(record.body) as { scan_submission_id: string }
			const { scan_submission_id } = body

			logger.info(TAG, "Loading submission", { scan_submission_id })
			const submission = await db.scanSubmission.findUniqueOrThrow({
				where: { id: scan_submission_id },
				include: {
					pages: { orderBy: { page_number: "asc" } },
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

			if (submission.status !== ScanStatus.ocr_complete) {
				logger.warn(TAG, "Submission not ocr_complete — skipping", {
					scan_submission_id,
					status: submission.status,
				})
				continue
			}

			await db.scanSubmission.update({
				where: { id: scan_submission_id },
				data: { status: ScanStatus.extracting },
			})

			const pageContext = submission.pages
				.map((p) => {
					const result = p.ocr_result as {
						transcript?: string
						features?: unknown[]
					} | null
					if (!result) return null
					return `Page ${p.page_number} (id: ${p.id}):\nTranscript: ${result.transcript ?? ""}\nFeatures: ${JSON.stringify(result.features ?? [])}`
				})
				.filter(Boolean)
				.join("\n\n")

			const questionContext = submission.exam_paper.sections
				.flatMap((sec) =>
					sec.exam_section_questions.map((esq) => {
						const q = esq.question
						const parts = (q.question_parts ?? [])
							.map(
								(part: { id: string; part_label: string; text: string }) =>
									`  Part ${part.part_label} (id: ${part.id}): ${part.text}`,
							)
							.join("\n")
						return `Question ${esq.order} (id: ${q.id}): ${q.text}${parts ? `\n${parts}` : ""}`
					}),
				)
				.join("\n\n")

			const questionCount = submission.exam_paper.sections.reduce(
				(s, sec) => s + sec.exam_section_questions.length,
				0,
			)
			logger.info(TAG, "Calling Gemini for answer extraction", {
				scan_submission_id,
				page_count: submission.pages.length,
				question_count: questionCount,
			})

			const response = await client.models.generateContent({
				model: "gemini-2.5-flash",
				contents: [
					{
						role: "user",
						parts: [
							{
								text: `You are mapping handwritten answer regions from OCR output to exam questions.

OCR output per page (transcript and bounding box features):
${pageContext}

Exam paper structure (questions and optional parts with IDs):
${questionContext}

For each distinct answer in the OCR output, determine which question (and if applicable which question part) it belongs to. Use the question_id/question_part_id from the lists above.

IMPORTANT: If a student's answer spans multiple pages, group all segments under a single extraction item with multiple page_segments entries. Do not split a single answer into multiple extraction items.

For each extraction item:
- Set extracted_text to the full concatenated answer text across all pages
- Set page_segments to the per-page breakdown, with the bounding_boxes from that page
- Be explicit about which page each segment belongs to using the page_number field
- Set confidence 0-1. Return only extractions you are confident about.`,
							},
						],
					},
				],
				config: {
					responseMimeType: "application/json",
					responseSchema: EXTRACTION_SCHEMA,
					temperature: 0.2,
				},
			})

			const responseText = response.text
			if (!responseText) {
				throw new Error("No response from Gemini")
			}

			const result = JSON.parse(responseText) as ExtractionResult
			logger.info(TAG, "Gemini extraction complete", {
				scan_submission_id,
				extractions_count: result.extractions?.length ?? 0,
			})

			for (const ext of result.extractions ?? []) {
				await db.extractedAnswer.create({
					data: {
						scan_submission_id,
						question_id: ext.question_id,
						question_part_id: ext.question_part_id ?? null,
						extracted_text: ext.extracted_text,
						page_segments: ext.page_segments as unknown as object,
						confidence: ext.confidence ?? null,
					},
				})
			}

			logger.info(TAG, "Submission extraction complete", { scan_submission_id })
			await db.scanSubmission.update({
				where: { id: scan_submission_id },
				data: { status: ScanStatus.extracted, processed_at: new Date() },
			})

			await Promise.all([
				sqs.send(
					new SendMessageCommand({
						QueueUrl: Resource.ScanGradingQueue.url,
						MessageBody: JSON.stringify({ scan_submission_id }),
					}),
				),
				sqs.send(
					new SendMessageCommand({
						QueueUrl: Resource.RegionRefinementQueue.url,
						MessageBody: JSON.stringify({ scan_submission_id }),
					}),
				),
			])

			logger.info(TAG, "Enqueued grading and region refinement", {
				scan_submission_id,
			})
		} catch (err) {
			logger.error(TAG, "Job failed with unhandled error", {
				messageId,
				error: String(err),
			})
			failures.push({ itemIdentifier: messageId })
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}

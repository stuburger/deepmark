import { db } from "@/db"
import { logger } from "@/lib/logger"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { GoogleGenAI, Type } from "@google/genai"
import type { ScanStatus, Subject } from "@mcp-gcse/db"
import { Resource } from "sst"

const TAG = "student-paper-ocr"

const s3 = new S3Client({})

interface SqsRecord {
	messageId: string
	body: string
}

interface SqsEvent {
	Records: SqsRecord[]
}

type PageEntry = {
	key: string
	order: number
	mime_type: string
}

const STUDENT_PAPER_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		student_name: { type: Type.STRING, nullable: true },
		detected_subject: { type: Type.STRING, nullable: true },
		answers: {
			type: Type.ARRAY,
			items: {
				type: Type.OBJECT,
				properties: {
					question_number: { type: Type.STRING },
					answer_text: { type: Type.STRING },
				},
				required: ["question_number", "answer_text"],
			},
		},
	},
	required: ["answers"],
}

const SUBJECT_VALUES = [
	"biology",
	"chemistry",
	"physics",
	"english",
	"english_literature",
	"mathematics",
	"history",
	"geography",
	"computer_science",
	"french",
	"spanish",
	"religious_studies",
	"business",
] as const

function isValidSubject(s: string): s is Subject {
	return (SUBJECT_VALUES as readonly string[]).includes(s)
}

async function getFileBase64(bucket: string, key: string): Promise<string> {
	const cmd = new GetObjectCommand({ Bucket: bucket, Key: key })
	const response = await s3.send(cmd)
	const body = await response.Body?.transformToByteArray()
	if (!body?.length) throw new Error(`Empty S3 object: ${key}`)
	return Buffer.from(body).toString("base64")
}

export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []
	const gemini = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })

	for (const record of event.Records) {
		const messageId = record.messageId
		let jobId: string | undefined

		try {
			const body = JSON.parse(record.body) as { job_id: string }
			jobId = body.job_id

			if (!jobId) {
				logger.warn(TAG, "Message missing job_id", { messageId })
				continue
			}

			logger.info(TAG, "OCR job received", { jobId, messageId })

			const job = await db.pdfIngestionJob.findUniqueOrThrow({
				where: { id: jobId },
			})

			if (job.document_type !== "student_paper") {
				logger.warn(TAG, "Job is not student_paper — skipping", {
					jobId,
					document_type: job.document_type,
				})
				continue
			}

			await db.pdfIngestionJob.update({
				where: { id: jobId },
				data: {
					attempt_count: { increment: 1 },
					status: "processing" as ScanStatus,
					error: null,
				},
			})

			const pages = (job.pages ?? []) as PageEntry[]
			const bucket = job.s3_bucket

			if (pages.length === 0) {
				throw new Error("No pages found on job — cannot run OCR")
			}

			logger.info(TAG, "Loading pages from S3", {
				jobId,
				page_count: pages.length,
			})

			const sortedPages = [...pages].sort((a, b) => a.order - b.order)

			// Fetch all pages in parallel
			const pageData = await Promise.all(
				sortedPages.map(async (page) => ({
					data: await getFileBase64(bucket, page.key),
					mimeType: page.mime_type as
						| "application/pdf"
						| "image/jpeg"
						| "image/png"
						| "image/webp"
						| "image/heic",
				})),
			)

			logger.info(TAG, "Calling Gemini to extract student answers", {
				jobId,
				page_count: pageData.length,
			})

			const inlineDataParts = pageData.map((p) => ({
				inlineData: { data: p.data, mimeType: p.mimeType },
			}))

			const response = await gemini.models.generateContent({
				model: "gemini-2.5-flash",
				contents: [
					{
						role: "user",
						parts: [
							...inlineDataParts,
							{
								text: `This is a student's exam answer sheet (${pageData.length} page${pageData.length > 1 ? "s" : ""}).

1. Extract the student's name if visible on any page.
2. Detect the subject (e.g. biology, chemistry, physics, mathematics, english, history, etc.) from any headers, logos, or question content.
3. Extract every answer the student has written, matched to its question number. Include all question numbers you can identify. Use an empty string if a question has no visible answer.

Return:
- student_name: the student's name (null if not found)
- detected_subject: the detected subject as a lowercase single word (null if unclear)
- answers: array of { question_number, answer_text } for every question found`,
							},
						],
					},
				],
				config: {
					responseMimeType: "application/json",
					responseSchema: STUDENT_PAPER_SCHEMA,
					temperature: 0.1,
				},
			})

			const responseText = response.text
			if (!responseText) throw new Error("No response from Gemini")

			const parsed = JSON.parse(responseText) as {
				student_name?: string | null
				detected_subject?: string | null
				answers: Array<{ question_number: string; answer_text: string }>
			}

			const answersExtracted = (parsed.answers ?? []).filter((a) =>
				a.answer_text.trim(),
			).length

			logger.info(TAG, "Gemini OCR complete", {
				jobId,
				student_name: parsed.student_name ?? null,
				detected_subject: parsed.detected_subject ?? null,
				answers_extracted: answersExtracted,
			})

			const rawSubject = parsed.detected_subject?.trim().toLowerCase()
			const detectedSubject: Subject | null =
				rawSubject && isValidSubject(rawSubject) ? rawSubject : null

			await db.pdfIngestionJob.update({
				where: { id: jobId },
				data: {
					status: "text_extracted" as ScanStatus,
					student_name: parsed.student_name?.trim() || null,
					detected_subject: detectedSubject,
					extracted_answers_raw: {
						student_name: parsed.student_name?.trim() || null,
						answers: parsed.answers ?? [],
					},
					processed_at: new Date(),
					error: null,
				},
			})

			logger.info(TAG, "OCR job complete", {
				jobId,
				status: "text_extracted",
				detected_subject: detectedSubject,
			})
		} catch (err) {
			logger.error(TAG, "OCR job failed", {
				jobId,
				error: String(err),
			})
			const message = err instanceof Error ? err.message : String(err)
			if (jobId) {
				try {
					await db.pdfIngestionJob.update({
						where: { id: jobId },
						data: { status: "failed" as ScanStatus, error: message },
					})
				} catch {
					// ignore
				}
			}
			failures.push({ itemIdentifier: messageId })
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}

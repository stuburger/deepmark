import { db } from "@/db"
import {
	type CancellationToken,
	createCancellationToken,
} from "@/lib/cancellation"
import { logger } from "@/lib/logger"
import { validateWithExemplars } from "@/services/validate-with-exemplars"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { GoogleGenAI, Type } from "@google/genai"
import type { ScanStatus } from "@mcp-gcse/db"
import { Resource } from "sst"

const TAG = "exemplar-pdf"

const s3 = new S3Client({})

interface S3Record {
	s3: { bucket: { name: string }; object: { key: string } }
}

interface SqsRecord {
	messageId: string
	body: string
}

interface SqsEvent {
	Records: SqsRecord[]
}

const EXEMPLAR_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		questions: {
			type: Type.ARRAY,
			items: {
				type: Type.OBJECT,
				properties: {
					question_text: { type: Type.STRING },
					exemplars: {
						type: Type.ARRAY,
						items: {
							type: Type.OBJECT,
							properties: {
								level: { type: Type.INTEGER },
								is_fake_exemplar: { type: Type.BOOLEAN },
								answer_text: { type: Type.STRING },
								word_count: { type: Type.INTEGER },
								why_criteria: {
									type: Type.ARRAY,
									items: { type: Type.STRING },
								},
								mark_band: { type: Type.STRING },
								expected_score: { type: Type.INTEGER },
							},
							required: [
								"level",
								"is_fake_exemplar",
								"answer_text",
								"why_criteria",
							],
						},
					},
				},
				required: ["question_text", "exemplars"],
			},
		},
	},
	required: ["questions"],
}

function parseJobIdFromKey(key: string): string {
	const decoded = decodeURIComponent(key)
	const parts = decoded.split("/")
	if (parts.length < 4 || parts[0] !== "pdfs" || parts[1] !== "exemplars") {
		throw new Error(`Unexpected exemplar S3 key format: ${key}`)
	}
	return parts[2] ?? ""
}

async function getPdfBase64(bucket: string, key: string): Promise<string> {
	const cmd = new GetObjectCommand({ Bucket: bucket, Key: key })
	const response = await s3.send(cmd)
	const body = await response.Body?.transformToByteArray()
	if (!body?.length) throw new Error("Empty S3 object")
	return Buffer.from(body).toString("base64")
}

export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []
	const gemini = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })

	for (const record of event.Records) {
		const messageId = record.messageId
		let cancellation: CancellationToken | undefined
		try {
			const body = JSON.parse(record.body) as
				| { Records?: S3Record[] }
				| { job_id: string }

			let bucket: string
			let key: string
			let jobId: string

			logger.info(TAG, "Message received", { messageId })

			if ("job_id" in body && typeof body.job_id === "string") {
				jobId = body.job_id
				const job = await db.pdfIngestionJob.findUniqueOrThrow({
					where: { id: jobId },
				})
				if (job.document_type !== "exemplar") {
					logger.warn(TAG, "Job is not exemplar — skipping", {
						jobId,
						document_type: job.document_type,
					})
					continue
				}
				bucket = job.s3_bucket
				key = job.s3_key
			} else {
				const s3Event = body as { Records?: S3Record[] }
				const s3Records = s3Event.Records ?? []
				const s3Record = s3Records[0]
				if (!s3Record) {
					logger.warn(TAG, "No S3 record in SQS message", { messageId })
					continue
				}
				bucket = s3Record.s3.bucket.name
				key = decodeURIComponent(s3Record.s3.object.key)
				jobId = parseJobIdFromKey(key)
				logger.info(TAG, "Triggered by S3 event", { jobId, bucket, key })
			}

			const job = await db.pdfIngestionJob.findUniqueOrThrow({
				where: { id: jobId },
			})

			if (job.document_type !== "exemplar" || !job.subject) {
				logger.warn(TAG, "Job invalid — wrong type or missing subject", {
					jobId,
					document_type: job.document_type,
					subject: job.subject,
				})
				await db.pdfIngestionJob.update({
					where: { id: jobId },
					data: {
						status: "failed" as ScanStatus,
						error: "Exemplar job missing required subject",
					},
				})
				continue
			}

			if (job.status === "cancelled") {
				logger.info(TAG, "Job was cancelled — skipping", { jobId })
				continue
			}

			cancellation = createCancellationToken(jobId)

			logger.info(TAG, "Job started", {
				jobId,
				subject: job.subject,
				exam_board: job.exam_board,
				attempt: job.attempt_count + 1,
			})

			const subject = job.subject
			const examBoard = job.exam_board
			const uploadedBy = job.uploaded_by

			await db.pdfIngestionJob.update({
				where: { id: jobId },
				data: {
					attempt_count: { increment: 1 },
					status: "processing" as ScanStatus,
					error: null,
				},
			})

			logger.info(TAG, "Fetching PDF from S3", { jobId, bucket, key })
			const pdfBase64 = await getPdfBase64(bucket, key)

			logger.info(TAG, "Calling Gemini to extract exemplar answers", { jobId })
			const response = await gemini.models.generateContent({
				model: "gemini-2.5-flash",
				contents: [
					{
						role: "user",
						parts: [
							{
								inlineData: {
									data: pdfBase64,
									mimeType: "application/pdf",
								},
							},
							{
								text: "Extract all questions and their exemplar answers from this document. For each question provide question_text and an array of exemplars. Each exemplar has: level (1-4), is_fake_exemplar (boolean), answer_text, word_count (optional), why_criteria (array of strings explaining why this answer achieves this level), mark_band (optional), expected_score (optional).",
							},
						],
					},
				],
				config: {
					responseMimeType: "application/json",
					responseSchema: EXEMPLAR_SCHEMA,
					temperature: 0.2,
				},
			})

			const responseText = response.text
			if (!responseText) throw new Error("No response from Gemini")

			logger.info(TAG, "Gemini extraction complete", { jobId })
			const parsed = JSON.parse(responseText) as {
				questions?: Array<{
					question_text: string
					exemplars: Array<{
						level: number
						is_fake_exemplar: boolean
						answer_text: string
						word_count?: number
						why_criteria: string[]
						mark_band?: string
						expected_score?: number
					}>
				}>
			}

			const questionCount = parsed.questions?.length ?? 0
			const exemplarCount =
				parsed.questions?.reduce((s, q) => s + q.exemplars.length, 0) ?? 0
			logger.info(TAG, "Exemplars extracted", {
				jobId,
				question_count: questionCount,
				exemplar_count: exemplarCount,
			})

			const markSchemeIdsToValidate = new Set<string>()

			for (const q of parsed.questions ?? []) {
				if (cancellation.isCancelled()) {
					logger.info(
						TAG,
						"Job cancelled mid-processing — stopping question loop",
						{
							jobId,
						},
					)
					break
				}

				const questionText = q.question_text

				// Find or create the Question row for this job + question text
				let question = await db.question.findFirst({
					where: {
						source_pdf_ingestion_job_id: jobId,
						text: questionText,
					},
				})

				if (!question) {
					question = await db.question.create({
						data: {
							text: questionText,
							topic: subject,
							created_by_id: uploadedBy,
							subject,
							question_type: "written",
							multiple_choice_options: [],
							source_pdf_ingestion_job_id: jobId,
						},
					})
				}

				for (const ex of q.exemplars ?? []) {
					const existing = await db.exemplarAnswer.findFirst({
						where: {
							pdf_ingestion_job_id: jobId,
							raw_question_text: questionText,
							level: ex.level,
						},
					})
					if (existing) {
						if (existing.mark_scheme_id)
							markSchemeIdsToValidate.add(existing.mark_scheme_id)
						continue
					}

					const created = await db.exemplarAnswer.create({
						data: {
							pdf_ingestion_job_id: jobId,
							question_id: question.id,
							raw_question_text: questionText,
							source_exam_board: examBoard,
							level: ex.level,
							is_fake_exemplar: ex.is_fake_exemplar ?? false,
							answer_text: ex.answer_text,
							word_count: ex.word_count ?? null,
							why_criteria: ex.why_criteria ?? [],
							mark_band: ex.mark_band ?? null,
							expected_score: ex.expected_score ?? null,
						},
					})

					if (created.mark_scheme_id)
						markSchemeIdsToValidate.add(created.mark_scheme_id)
				}
			}

			if (cancellation.isCancelled()) {
				logger.info(TAG, "Job was cancelled — skipping completion", { jobId })
				continue
			}

			for (const markSchemeId of markSchemeIdsToValidate) {
				try {
					logger.info(TAG, "Running exemplar validation", {
						jobId,
						mark_scheme_id: markSchemeId,
					})
					const summary = await validateWithExemplars(markSchemeId)
					logger.info(TAG, "Exemplar validation complete", {
						jobId,
						mark_scheme_id: markSchemeId,
						pass_count: summary.passCount,
						total_tested: summary.totalTested,
						accuracy_percent: summary.accuracyPercent,
					})
				} catch (err) {
					logger.error(TAG, "Exemplar validation failed", {
						jobId,
						mark_scheme_id: markSchemeId,
						error: String(err),
					})
				}
			}

			logger.info(TAG, "Job completed successfully", {
				jobId,
				question_count: questionCount,
				exemplar_count: exemplarCount,
			})
			await db.pdfIngestionJob.update({
				where: { id: jobId },
				data: {
					status: "ocr_complete" as ScanStatus,
					processed_at: new Date(),
					error: null,
				},
			})
		} catch (err) {
			logger.error(TAG, "Job failed with unhandled error", {
				error: String(err),
			})
			const message = err instanceof Error ? err.message : String(err)
			try {
				const body = JSON.parse(record.body) as
					| { job_id?: string }
					| { Records?: S3Record[] }
				const jobId =
					"job_id" in body && body.job_id
						? body.job_id
						: parseJobIdFromKey(
								(record.body &&
									(JSON.parse(record.body) as { Records?: S3Record[] })
										.Records?.[0]?.s3?.object?.key) ??
									"",
							)
				if (jobId) {
					await db.pdfIngestionJob.update({
						where: { id: jobId },
						data: { status: "failed" as ScanStatus, error: message },
					})
				}
			} catch {
				// ignore
			}
			failures.push({ itemIdentifier: messageId })
		} finally {
			cancellation?.stop()
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}

import { db } from "@/db"
import {
	type CancellationToken,
	createCancellationToken,
} from "@/lib/infra/cancellation"
import { logger } from "@/lib/infra/logger"
import {
	getPdfBase64,
	parsePdfIngestionTrigger,
} from "@/lib/infra/processor-s3"
import {
	type SqsEvent,
	markPdfIngestionFailed,
} from "@/lib/infra/sqs-job-runner"
import { validateWithExemplars } from "@/services/validate-with-exemplars"
import { GoogleGenAI } from "@google/genai"
import type { ScanStatus } from "@mcp-gcse/db"
import { Resource } from "sst"
import { EXTRACT_EXEMPLARS_PROMPT } from "./exemplar-pdf/prompts"
import { EXEMPLAR_SCHEMA } from "./exemplar-pdf/schema"

const TAG = "exemplar-pdf"

export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []
	const gemini = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })

	for (const record of event.Records) {
		const messageId = record.messageId
		let cancellation: CancellationToken | undefined
		try {
			logger.info(TAG, "Message received", { messageId })

			const trigger = await parsePdfIngestionTrigger(
				record,
				"exemplar",
				"exemplars",
				TAG,
			)
			if (trigger.kind === "skip") {
				logger.info(TAG, trigger.reason, { messageId })
				continue
			}
			const { jobId, bucket, key } = trigger

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
						status: "failed" satisfies ScanStatus,
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
					status: "processing" satisfies ScanStatus,
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
								text: EXTRACT_EXEMPLARS_PROMPT,
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
					status: "ocr_complete" satisfies ScanStatus,
					processed_at: new Date(),
					error: null,
				},
			})
		} catch (err) {
			await markPdfIngestionFailed(record, "exemplars", TAG, err)
			failures.push({ itemIdentifier: messageId })
		} finally {
			cancellation?.stop()
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}

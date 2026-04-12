import { db } from "@/db"
import {
	type CancellationToken,
	createCancellationToken,
} from "@/lib/infra/cancellation"
import { callLlmWithFallback, createLlmRunner } from "@/lib/infra/llm-runtime"
import { logger } from "@/lib/infra/logger"
import { outputSchema } from "@/lib/infra/output-schema"
import {
	getPdfBase64,
	parsePdfIngestionTrigger,
} from "@/lib/infra/processor-s3"
import {
	type SqsEvent,
	markPdfIngestionFailed,
} from "@/lib/infra/sqs-job-runner"
import type { ScanStatus } from "@mcp-gcse/db"
import { Grader } from "@mcp-gcse/shared"
import { generateText } from "ai"
import { linkJobQuestionsToExamPaper } from "./mark-scheme-pdf/linking"
import { processExtractedQuestion } from "./mark-scheme-pdf/process-question"
import {
	buildExistingQuestionsBlock,
	buildExtractionPrompt,
} from "./mark-scheme-pdf/prompts"
import { fetchExistingQuestionsForJob } from "./mark-scheme-pdf/queries"
import {
	ExamPaperMetadataSchema,
	MarkSchemeSchema,
} from "./mark-scheme-pdf/schema"

import { normalizeQuestionNumber } from "@/lib/grading/normalize-question-number"
export { normalizeQuestionNumber }

const TAG = "mark-scheme-pdf"

type DetectedMetadata = {
	title?: string
	subject?: string
	exam_board?: string
	total_marks?: number
	duration_minutes?: number
	year?: number | null
}

export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []

	for (const record of event.Records) {
		const messageId = record.messageId
		let cancellation: CancellationToken | undefined
		try {
			logger.info(TAG, "Message received", { messageId })

			const trigger = await parsePdfIngestionTrigger(
				record,
				"mark_scheme",
				"mark-schemes",
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
			if (job.document_type !== "mark_scheme" || !job.subject) {
				logger.warn(TAG, "Job invalid — wrong type or missing subject", {
					jobId,
					document_type: job.document_type,
					subject: job.subject,
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
				auto_create_exam_paper: job.auto_create_exam_paper,
			})

			await db.pdfIngestionJob.update({
				where: { id: jobId },
				data: {
					attempt_count: { increment: 1 },
					status: "processing" satisfies ScanStatus,
					error: null,
				},
			})

			// ── Gemini extraction ─────────────────────────────────────────────

			const pdfBase64 = await getPdfBase64(bucket, key)
			const subject = job.subject
			const uploadedBy = job.uploaded_by

			const existingQuestionsForContext = await fetchExistingQuestionsForJob(
				job.exam_paper_id,
				job.exam_board,
			)
			const existingQuestionsBlock = buildExistingQuestionsBlock(
				existingQuestionsForContext,
			)

			logger.info(TAG, "Calling LLM for mark scheme + metadata extraction", {
				jobId,
				auto_create_exam_paper: job.auto_create_exam_paper,
				existing_questions_in_context: existingQuestionsForContext.length,
			})

			const pdfContent = [
				{
					type: "file" as const,
					data: pdfBase64,
					mediaType: "application/pdf",
				},
			]

			const [markSchemeResult, metadataResult] = await Promise.all([
				callLlmWithFallback(
					"mark-scheme-extraction",
					async (model, entry, report) => {
						const result = await generateText({
							model,
							temperature: entry.temperature,
							messages: [
								{
									role: "user",
									content: [
										...pdfContent,
										{
											type: "text",
											text: buildExtractionPrompt(existingQuestionsBlock),
										},
									],
								},
							],
							output: outputSchema(MarkSchemeSchema),
						})
						report.usage = result.usage
						return result
					},
				),
				job.auto_create_exam_paper
					? callLlmWithFallback(
							"mark-scheme-metadata",
							async (model, entry, report) => {
								const result = await generateText({
									model,
									temperature: entry.temperature,
									messages: [
										{
											role: "user",
											content: [
												...pdfContent,
												{
													type: "text",
													text: "From the document header or cover, extract: title (exam paper title), subject, exam_board, total_marks, duration_minutes, and year if visible. Return only these fields.",
												},
											],
										},
									],
									output: outputSchema(ExamPaperMetadataSchema),
								})
								report.usage = result.usage
								return result
							},
						)
					: Promise.resolve(null),
			])

			// ── Parse response ────────────────────────────────────────────────

			logger.info(TAG, "LLM extraction complete", { jobId })
			const parsed = markSchemeResult.output

			const detectedMetadata: DetectedMetadata | null = metadataResult
				? (metadataResult.output as DetectedMetadata)
				: null

			// ── Process each question ─────────────────────────────────────────

			let grader: Grader | null = null
			if (job.run_adversarial_loop) {
				grader = new Grader(createLlmRunner(), {
					systemPrompt:
						"You are an expert GCSE examiner. Mark the student's answer against the provided mark scheme. Return valid JSON matching the schema. Be consistent and conservative.",
				})
			}

			const questionCount = parsed.questions?.length ?? 0
			logger.info(TAG, "Processing questions from mark scheme", {
				jobId,
				question_count: questionCount,
			})

			for (let i = 0; i < questionCount; i++) {
				const q = parsed.questions[i]
				if (!q) continue

				if (cancellation.isCancelled()) {
					logger.info(TAG, "Job cancelled mid-processing — stopping loop", {
						jobId,
						question_index: i + 1,
					})
					break
				}

				await processExtractedQuestion(q, i, questionCount, {
					jobId,
					uploadedBy,
					subject,
					examPaperId: job.exam_paper_id,
					examBoard: job.exam_board,
					existingQuestions: existingQuestionsForContext,
					grader,
					runAdversarialLoopEnabled: job.run_adversarial_loop,
				})
			}

			// ── Completion ────────────────────────────────────────────────────

			if (cancellation.isCancelled()) {
				logger.info(TAG, "Job was cancelled — skipping completion", { jobId })
				continue
			}

			if (job.exam_paper_id) {
				await linkJobQuestionsToExamPaper(jobId, job.exam_paper_id, uploadedBy)
			}

			logger.info(TAG, "Job completed successfully", {
				jobId,
				question_count: questionCount,
			})
			await db.pdfIngestionJob.update({
				where: { id: jobId },
				data: {
					status: "ocr_complete" satisfies ScanStatus,
					processed_at: new Date(),
					detected_exam_paper_metadata: detectedMetadata ?? undefined,
					error: null,
				},
			})
		} catch (err) {
			await markPdfIngestionFailed(record, "mark-schemes", TAG, err)
			failures.push({ itemIdentifier: messageId })
		} finally {
			cancellation?.stop()
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}

import { db } from "@/db"
import {
	type LinkSectionInput,
	linkJobQuestionsToExamPaperSections,
} from "@/lib/grading/link-job-questions"
import { normalizeQuestionNumber } from "@/lib/grading/normalize-question-number"
import {
	type CancellationToken,
	createCancellationToken,
} from "@/lib/infra/cancellation"
import { embedQuestionText } from "@/lib/infra/google-generative-ai"
import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import { logger } from "@/lib/infra/logger"
import { outputSchema } from "@/lib/infra/output-schema"
import {
	embeddingToVectorStr,
	getPdfBase64,
	parsePdfIngestionTrigger,
} from "@/lib/infra/processor-s3"
import {
	type SqsEvent,
	markPdfIngestionFailed,
} from "@/lib/infra/sqs-job-runner"
import type { ScanStatus } from "@mcp-gcse/db"
import { generateText } from "ai"
import {
	EXTRACT_METADATA_PROMPT,
	EXTRACT_QUESTIONS_PROMPT,
} from "./question-paper-pdf/prompts"
import {
	QuestionPaperMetadataSchema,
	QuestionPaperSchema,
} from "./question-paper-pdf/schema"

const TAG = "question-paper-pdf"

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
				"question_paper",
				"question-papers",
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

			if (job.document_type !== "question_paper" || !job.subject) {
				logger.warn(TAG, "Job invalid — wrong type or missing subject", {
					jobId,
					document_type: job.document_type,
					subject: job.subject,
				})
				await db.pdfIngestionJob.update({
					where: { id: jobId },
					data: {
						status: "failed" satisfies ScanStatus,
						error: "Question paper job missing required subject",
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

			logger.info(TAG, "Calling LLM for question extraction + metadata", {
				jobId,
			})

			const pdfContent = [
				{
					type: "file" as const,
					data: pdfBase64,
					mediaType: "application/pdf",
				},
			]

			const [questionsResult, metadataResult] = await Promise.all([
				callLlmWithFallback(
					"question-paper-extraction",
					async (model, entry, report) => {
						const result = await generateText({
							model,
							temperature: entry.temperature,
							messages: [
								{
									role: "user",
									content: [
										...pdfContent,
										{ type: "text", text: EXTRACT_QUESTIONS_PROMPT },
									],
								},
							],
							output: outputSchema(QuestionPaperSchema),
						})
						report.usage = result.usage
						return result
					},
				),
				callLlmWithFallback(
					"question-paper-metadata",
					async (model, entry, report) => {
						const result = await generateText({
							model,
							temperature: entry.temperature,
							messages: [
								{
									role: "user",
									content: [
										...pdfContent,
										{ type: "text", text: EXTRACT_METADATA_PROMPT },
									],
								},
							],
							output: outputSchema(QuestionPaperMetadataSchema),
						})
						report.usage = result.usage
						return result
					},
				),
			])

			logger.info(TAG, "LLM extraction complete", { jobId })
			const parsed = questionsResult.output as {
				sections?: Array<{
					title: string
					description?: string | null
					total_marks: number
					questions: Array<{
						question_text: string
						question_type?: string
						total_marks: number
						question_number?: string
						options?: Array<{ option_label: string; option_text: string }>
					}>
				}>
			}

			type DetectedMetadata = {
				title?: string
				subject?: string
				exam_board?: string
				total_marks?: number
				duration_minutes?: number
				year?: number | null
				paper_number?: number | null
				tier?: string | null
			}
			let detectedMetadata: DetectedMetadata | null = null
			try {
				detectedMetadata = metadataResult.output as DetectedMetadata
			} catch {
				// ignore
			}

			const sections = parsed.sections ?? []
			const questionCount = sections.reduce(
				(acc, s) => acc + s.questions.length,
				0,
			)
			logger.info(TAG, "Creating questions from paper", {
				jobId,
				section_count: sections.length,
				question_count: questionCount,
				detected_title: detectedMetadata?.title ?? null,
			})

			const sectionInputs: LinkSectionInput[] = []
			let questionIndex = 0
			for (const section of sections) {
				if (cancellation.isCancelled()) break
				const questionIds: string[] = []

				for (const q of section.questions) {
					if (cancellation.isCancelled()) {
						logger.info(TAG, "Job cancelled mid-processing — stopping loop", {
							jobId,
							question_index: questionIndex + 1,
						})
						break
					}
					questionIndex++

					const questionText = q.question_text
					const canonicalNumber = q.question_number
						? normalizeQuestionNumber(q.question_number)
						: null
					logger.info(TAG, "Creating question", {
						jobId,
						section: section.title,
						index: questionIndex,
						total: questionCount,
						question_number: canonicalNumber,
						marks: q.total_marks,
						type: q.question_type ?? "written",
					})
					const embeddingVec = await embedQuestionText(questionText)
					const vecStr = embeddingToVectorStr(embeddingVec)

					const newQuestion = await db.question.create({
						data: {
							text: questionText,
							topic: subject,
							created_by_id: uploadedBy,
							subject,
							points: q.total_marks,
							question_type:
								q.question_type === "multiple_choice"
									? "multiple_choice"
									: "written",
							multiple_choice_options:
								q.question_type === "multiple_choice" && q.options?.length
									? q.options
									: [],
							source_pdf_ingestion_job_id: jobId,
							origin: "question_paper",
							question_number: canonicalNumber,
						},
					})

					await db.$executeRaw`
						UPDATE questions SET embedding = (${vecStr}::text)::vector WHERE id = ${newQuestion.id}
					`
					questionIds.push(newQuestion.id)
				}

				sectionInputs.push({
					title: section.title,
					description: section.description ?? null,
					total_marks: section.total_marks,
					question_ids: questionIds,
				})
			}

			if (cancellation.isCancelled()) {
				logger.info(TAG, "Job was cancelled — skipping completion", { jobId })
				continue
			}

			// If the job is linked to an existing exam paper, create one ExamSection
			// per LLM-reported section and link questions accordingly.
			if (job.exam_paper_id) {
				await linkJobQuestionsToExamPaperSections(
					job.exam_paper_id,
					uploadedBy,
					sectionInputs,
				)

				// Defensive tier backfill: the pre-ingestion metadata extraction is the
				// primary source, but when it misses (older flow, MCP creation) the
				// processor's own extraction can fill the gap. Never overwrite an
				// existing tier — the teacher may have set it manually.
				const detectedTier = detectedMetadata?.tier
				if (detectedTier === "foundation" || detectedTier === "higher") {
					await db.examPaper.updateMany({
						where: { id: job.exam_paper_id, tier: null },
						data: { tier: detectedTier },
					})
				}
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
			await markPdfIngestionFailed(record, "question-papers", TAG, err)
			failures.push({ itemIdentifier: messageId })
		} finally {
			cancellation?.stop()
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}

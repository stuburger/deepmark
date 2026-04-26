import { db } from "@/db"
import {
	isValidSubject,
	loadQuestionSeeds,
	parsePages,
} from "@/lib/grading/question-seeds"
import { createCancellationToken } from "@/lib/infra/cancellation"
import { createLlmRunner } from "@/lib/infra/llm-runtime"
import { logger } from "@/lib/infra/logger"
import { getFileBase64 } from "@/lib/infra/s3"
import {
	type SqsEvent,
	markJobFailed,
	parseSqsJobId,
} from "@/lib/infra/sqs-job-runner"
import {
	type AttributeScriptQuestion,
	attributeScript,
} from "@/lib/scan-extraction/attribute-script"
import { runVisionOcr } from "@/lib/scan-extraction/cloud-vision-ocr"
import { runOcr } from "@/lib/scan-extraction/gemini-ocr"
import { persistTokens } from "@/lib/scan-extraction/persist-tokens"
import { resolveMcqAnswers } from "@/lib/scan-extraction/resolve-mcq-answers"
import { saveVisionRaw } from "@/lib/scan-extraction/save-vision-raw"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { type OcrStatus, type Subject, logOcrRunEvent } from "@mcp-gcse/db"
import { Resource } from "sst"

const TAG = "student-paper-extract"

const sqs = new SQSClient({})

export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []

	for (const record of event.Records) {
		const jobId = parseSqsJobId(record, TAG)
		if (!jobId) continue

		const cancellation = createCancellationToken(jobId)
		const llm = createLlmRunner()
		try {
			logger.info(TAG, "OCR job received", {
				jobId,
				messageId: record.messageId,
			})

			const job = await db.studentSubmission.findUniqueOrThrow({
				where: { id: jobId },
			})

			await db.ocrRun.upsert({
				where: { id: jobId },
				create: {
					id: jobId,
					submission_id: jobId,
					status: "processing" satisfies OcrStatus,
					started_at: new Date(),
				},
				update: {
					status: "processing" satisfies OcrStatus,
					error: null,
					started_at: new Date(),
				},
			})

			void logOcrRunEvent(db, jobId, {
				type: "ocr_started",
				at: new Date().toISOString(),
			})

			const pages = parsePages(job.pages)
			const bucket = job.s3_bucket

			if (pages.length === 0) {
				throw new Error("No pages found on job — cannot run OCR")
			}

			logger.info(TAG, "Loading pages from S3 and question seeds", {
				jobId,
				page_count: pages.length,
				exam_paper_id: job.exam_paper_id,
			})

			const sortedPages = [...pages].sort((a, b) => a.order - b.order)

			// Load pages from S3 and question seeds concurrently
			const [pageData, questionSeeds] = await Promise.all([
				Promise.all(
					sortedPages.map(async (page) => ({
						data: await getFileBase64(bucket, page.key),
						mimeType: page.mime_type,
					})),
				),
				loadQuestionSeeds(job.exam_paper_id),
			])

			logger.info(TAG, "Question seeds loaded", {
				jobId,
				seed_count: questionSeeds.length,
			})

			if (cancellation.isCancelled()) {
				logger.info(TAG, "Job cancelled before OCR calls — skipping", {
					jobId,
				})
				continue
			}

			logger.info(
				TAG,
				"Calling Gemini (per-page transcripts) and Cloud Vision (word tokens) in parallel",
				{ jobId, page_count: pageData.length },
			)

			// Fan out: per-page Gemini transcript + Cloud Vision word token detection — all in parallel.
			// First page also extracts student name and detected subject.
			const [pageOcrResults, ...visionResults] = await Promise.all([
				Promise.all(
					sortedPages.map((page, i) => {
						const pageEntry = pageData[i]
						if (!pageEntry) {
							throw new Error(
								`pageData[${i}] is undefined — sortedPages and pageData are out of sync`,
							)
						}
						return runOcr(
							pageEntry.data,
							page.mime_type,
							{ extractMetadata: i === 0 },
							llm,
						)
					}),
				),
				...sortedPages.map((page, i) => {
					const pageEntry = pageData[i]
					if (!pageEntry) {
						throw new Error(
							`pageData[${i}] is undefined — sortedPages and pageData are out of sync`,
						)
					}
					return runVisionOcr(pageEntry.data, page.mime_type).catch((err) => {
						logger.error(TAG, "Cloud Vision failed for page — skipping", {
							jobId,
							pageOrder: page.order,
							error: String(err),
						})
						return null
					})
				}),
			])

			if (cancellation.isCancelled()) {
				logger.info(TAG, "Job cancelled after OCR calls — skipping DB write", {
					jobId,
				})
				continue
			}

			// Extract student metadata from first-page OCR result
			const firstPageOcr = pageOcrResults[0]
			const rawSubject = firstPageOcr?.detectedSubject?.trim().toLowerCase()
			const detectedSubject: Subject | null =
				rawSubject && isValidSubject(rawSubject) ? rawSubject : null
			const studentName = firstPageOcr?.studentName?.trim() || null

			const pageAnalyses = sortedPages.map((page, i) => ({
				page: page.order,
				transcript: pageOcrResults[i]?.transcript ?? "",
				observations: pageOcrResults[i]?.observations ?? [],
			}))

			logger.info(TAG, "Gemini OCR complete", {
				jobId,
				student_name: studentName,
				detected_subject: detectedSubject,
				pages_analysed: pageAnalyses.length,
			})

			void logOcrRunEvent(db, jobId, {
				type: "answers_extracted",
				at: new Date().toISOString(),
				count: 0,
				student_name: studentName,
			})

			// Persist student metadata on the submission
			await db.studentSubmission.update({
				where: { id: jobId },
				data: {
					student_name: studentName,
					detected_subject: detectedSubject,
				},
			})

			// Persist page analyses on OcrRun for UI display while Vision token work runs
			await db.ocrRun.update({
				where: { id: jobId },
				data: { page_analyses: pageAnalyses },
			})

			const insertedTokens = await persistTokens(
				jobId,
				sortedPages,
				visionResults,
			)

			// Build page transcripts map for attribution context
			const pageTranscripts = new Map(
				sortedPages.map((page, i) => [
					page.order,
					pageOcrResults[i]?.transcript ?? "",
				]),
			)

			const visionRawKey = await saveVisionRaw(
				jobId,
				bucket,
				sortedPages,
				visionResults,
			)

			// Phase 2a — assign tokens to questions, derive answer regions, and
			// apply OCR corrections. All three happen in a single attribution LLM
			// call per page — the model sees the image, transcript, and token list.
			void logOcrRunEvent(db, jobId, {
				type: "region_attribution_started",
				at: new Date().toISOString(),
			})

			const attributeQuestions: AttributeScriptQuestion[] = questionSeeds.map(
				(s) => ({
					question_id: s.question_id,
					question_number: s.question_number,
					question_text: s.question_text,
					is_mcq: s.question_type === "multiple_choice",
				}),
			)

			const { answers: baseAnswers } = await attributeScript({
				questions: attributeQuestions,
				pageTranscripts,
				pages: sortedPages,
				s3Bucket: bucket,
				tokens: insertedTokens,
				jobId,
				llm,
			})

			// MCQ answer_text comes from the OCR pass, which reads ticks/crosses/
			// circles/fills/handwriting holistically. Non-MCQ answers keep the
			// LLM-authored text that attribution produced.
			const reconstructedAnswers = resolveMcqAnswers({
				baseAnswers,
				ocrSelectionsByPage: pageOcrResults.map((r) => r.mcqSelections),
				questionSeeds,
			})

			const answersExtracted = reconstructedAnswers.filter((a) =>
				a.answer_text.trim(),
			).length

			logger.info(TAG, "Answers finalised", {
				jobId,
				answers_with_text: answersExtracted,
				answers_total: reconstructedAnswers.length,
			})

			await db.ocrRun.update({
				where: { id: jobId },
				data: {
					extracted_answers_raw: {
						student_name: studentName,
						answers: reconstructedAnswers,
					},
				},
			})

			// OCR Lambda no longer writes to the Y.Doc. The grade Lambda
			// owns the editor session and projects the OCR shape (skeleton +
			// answer text + ocrToken marks) at the start of its own run, so
			// the original-grade and re-grade flows converge — re-grade
			// creates a new submission with a fresh empty Y.Doc and bypasses
			// this Lambda entirely, but still gets a populated editor
			// because the projection happens grade-side. See
			// `docs/build-plan-doc-as-source-of-truth.md`.

			await db.ocrRun.update({
				where: { id: jobId },
				data: {
					status: "complete" satisfies OcrStatus,
					vision_raw_s3_key: visionRawKey,
					llm_snapshot: llm.toSnapshot(),
					completed_at: new Date(),
					error: null,
				},
			})

			void logOcrRunEvent(db, jobId, {
				type: "ocr_complete",
				at: new Date().toISOString(),
			})

			await sqs.send(
				new SendMessageCommand({
					QueueUrl: Resource.StudentPaperQueue.url,
					MessageBody: JSON.stringify({ job_id: jobId }),
				}),
			)

			logger.info(TAG, "OCR job complete — grading queued", {
				jobId,
				exam_paper_id: job.exam_paper_id,
				detected_subject: detectedSubject,
				word_tokens_inserted: insertedTokens.length,
			})
		} catch (err) {
			await markJobFailed(jobId, TAG, "ocr", err)
			failures.push({ itemIdentifier: record.messageId })
		} finally {
			cancellation.stop()
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}

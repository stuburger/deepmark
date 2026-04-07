import { db } from "@/db"
import { createCancellationToken } from "@/lib/infra/cancellation"
import { runVisionOcr } from "@/lib/scan-extraction/cloud-vision-ocr"
import { type PageMimeType, extractStudentPaper } from "@/lib/scan-extraction/gemini-extract"
import { logger } from "@/lib/infra/logger"
import { getFileBase64, s3 } from "@/lib/infra/s3"
import {
	type SqsEvent,
	markJobFailed,
	parseSqsJobId,
} from "@/lib/infra/sqs-job-runner"
import {
	type PageEntry,
	isValidSubject,
	loadQuestionSeeds,
	parsePages,
} from "@/lib/grading/question-seeds"
import {
	type VisionAttributeQuestion,
	visionAttributeRegions,
} from "@/lib/scan-extraction/vision-attribute"
import { reconcilePageTokens } from "@/lib/scan-extraction/vision-reconcile"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import {
	type OcrStatus,
	type ScanStatus,
	type Subject,
	logStudentPaperEvent,
} from "@mcp-gcse/db"
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
		try {
			logger.info(TAG, "OCR job received", {
				jobId,
				messageId: record.messageId,
			})

			const job = await db.studentPaperJob.findUniqueOrThrow({
				where: { id: jobId },
			})

			if (job.status === "cancelled") {
				logger.info(TAG, "Job was cancelled — skipping", { jobId })
				continue
			}

			await db.studentPaperJob.update({
				where: { id: jobId },
				data: {
					status: "processing" satisfies ScanStatus,
					error: null,
				},
			})

			// Phase 3 dual-write: create/update OcrRun (submission_id === jobId by migration convention)
			await db.ocrRun
				.upsert({
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
				.catch(() => {})

			void logStudentPaperEvent(db, jobId, {
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
						mimeType: page.mime_type as PageMimeType,
					})),
				),
				loadQuestionSeeds(job.exam_paper_id),
			])

			logger.info(TAG, "Question seeds loaded", {
				jobId,
				seed_count: questionSeeds.length,
			})

			if (cancellation.isCancelled()) {
				logger.info(TAG, "Job cancelled before Gemini call — skipping", {
					jobId,
				})
				continue
			}

			logger.info(
				TAG,
				"Calling Gemini (answer extraction + transcripts) and Cloud Vision (word tokens) in parallel",
				{ jobId, page_count: pageData.length },
			)

			// Fan out: Gemini answer extraction (all pages), per-page Gemini transcript,
			// and per-page Cloud Vision word token detection — all in parallel.
			const [extraction, ...visionResults] = await Promise.all([
				extractStudentPaper(pageData, questionSeeds),
				...sortedPages.map((page, i) => {
					// Skip Vision for PDF pages (Cloud Vision requires raster images)
					if (page.mime_type === "application/pdf") {
						return Promise.resolve(null)
					}
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

			// Map each OCR result back to its page order number (transcript + observations only)
			const pageAnalyses = extraction.ocrResults.map((analysis, i) => {
				const pageOrder = sortedPages[i]?.order
				if (pageOrder == null) {
					throw new Error(
						`sortedPages[${i}] is undefined while mapping ocrResults — arrays are out of sync`,
					)
				}
				return {
					page: pageOrder,
					transcript: analysis.transcript,
					observations: analysis.observations,
				}
			})

			const answersExtracted = extraction.answers.filter((a) =>
				a.answer_text.trim(),
			).length

			const rawSubject = extraction.detectedSubject?.trim().toLowerCase()
			const detectedSubject: Subject | null =
				rawSubject && isValidSubject(rawSubject) ? rawSubject : null

			logger.info(TAG, "Gemini OCR complete", {
				jobId,
				student_name: extraction.studentName,
				detected_subject: extraction.detectedSubject,
				answers_extracted: answersExtracted,
				answers_total: extraction.answers.length,
				pages_analysed: pageAnalyses.length,
			})

			void logStudentPaperEvent(db, jobId, {
				type: "answers_extracted",
				at: new Date().toISOString(),
				count: answersExtracted,
				student_name: extraction.studentName?.trim() || null,
			})

			// Persist extracted answers immediately so the UI can show them while
			// Vision token work (reconciliation + region attribution) runs below.
			await db.studentPaperJob.update({
				where: { id: jobId },
				data: {
					student_name: extraction.studentName?.trim() || null,
					detected_subject: detectedSubject,
					extracted_answers_raw: {
						student_name: extraction.studentName?.trim() || null,
						answers: extraction.answers,
					},
					page_analyses: pageAnalyses,
				},
			})

			// Phase 3 dual-write: update OcrRun with extracted data
			db.ocrRun
				.update({
					where: { id: jobId },
					data: {
						extracted_answers_raw: {
							student_name: extraction.studentName?.trim() || null,
							answers: extraction.answers,
						},
						page_analyses: pageAnalyses,
					},
				})
				.catch(() => {})

			// Save raw Cloud Vision responses to S3
			const visionRawKey = `scans/${jobId}/vision-raw.json`
			const visionRawPayload = {
				pages: visionResults.map((result, i) => {
					const pageOrder = sortedPages[i]?.order
					if (pageOrder == null) {
						throw new Error(
							`sortedPages[${i}] is undefined while building visionRawPayload — arrays are out of sync`,
						)
					}
					return {
						page_order: pageOrder,
						response: result?.rawResponse ?? null,
					}
				}),
			}

			try {
				await s3.send(
					new PutObjectCommand({
						Bucket: bucket,
						Key: visionRawKey,
						Body: JSON.stringify(visionRawPayload),
						ContentType: "application/json",
					}),
				)
				logger.info(TAG, "Raw Cloud Vision output saved to S3", {
					jobId,
					key: visionRawKey,
				})
			} catch (err) {
				logger.error(
					TAG,
					"Failed to save raw Vision output to S3 — non-fatal",
					{
						jobId,
						error: String(err),
					},
				)
			}

			// Bulk-insert word tokens from Cloud Vision into Neon
			const tokenRows = visionResults.flatMap((result, i) => {
				if (!result) return []
				const pageOrder = sortedPages[i]?.order
				if (pageOrder == null) {
					throw new Error(
						`sortedPages[${i}] is undefined while building tokenRows — arrays are out of sync`,
					)
				}
				return result.tokens.map((t) => ({
					job_id: jobId,
					submission_id: jobId, // Phase 3: submission_id === jobId by migration convention
					page_order: pageOrder,
					para_index: t.para_index,
					line_index: t.line_index,
					word_index: t.word_index,
					text_raw: t.text_raw,
					bbox: t.bbox,
					confidence: t.confidence,
				}))
			})

			// Insert tokens and return the created rows (with DB-generated ids) so
			// the records can be threaded directly into reconcile and attribution
			// without redundant DB round-trips.
			const insertedTokens =
				tokenRows.length > 0
					? await db.studentPaperPageToken.createManyAndReturn({
							data: tokenRows,
							select: {
								id: true,
								page_order: true,
								para_index: true,
								line_index: true,
								word_index: true,
								text_raw: true,
								bbox: true,
							},
						})
					: []

			if (insertedTokens.length > 0) {
				logger.info(TAG, "Word tokens inserted", {
					jobId,
					token_count: insertedTokens.length,
				})
			}

			// Phase 2a — correct raw Vision token text against the page image.
			// Returns the same tokens with text_corrected populated, which are
			// passed directly to Phase 2b — making the dependency explicit.
			const correctedTokens = await reconcilePageTokens({
				pages: sortedPages,
				tokens: insertedTokens,
				jobId,
			})

			// Phase 2b — assign corrected tokens to questions, derive answer regions.
			void logStudentPaperEvent(db, jobId, {
				type: "region_attribution_started",
				at: new Date().toISOString(),
			})
			const attributeQuestions: VisionAttributeQuestion[] = questionSeeds.map(
				(s) => ({
					question_id: s.question_id,
					question_number: s.question_number,
					question_text: s.question_text,
					is_mcq: s.question_type === "multiple_choice",
				}),
			)
			await visionAttributeRegions({
				questions: attributeQuestions,
				extractedAnswers: extraction.answers,
				pages: sortedPages,
				s3Bucket: bucket,
				tokens: correctedTokens,
				jobId,
			})

			await db.studentPaperJob.update({
				where: { id: jobId },
				data: {
					status: "text_extracted" satisfies ScanStatus,
					vision_raw_s3_key: visionRawKey,
					processed_at: new Date(),
					error: null,
				},
			})

			// Phase 3 dual-write: mark OcrRun complete
			db.ocrRun
				.update({
					where: { id: jobId },
					data: {
						status: "complete" satisfies OcrStatus,
						vision_raw_s3_key: visionRawKey,
						completed_at: new Date(),
						error: null,
					},
				})
				.catch(() => {})

			void logStudentPaperEvent(db, jobId, {
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
				word_tokens_inserted: tokenRows.length,
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

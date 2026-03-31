import { db } from "@/db"
import { createCancellationToken } from "@/lib/cancellation"
import { runVisionOcr } from "@/lib/cloud-vision-ocr"
import {
	type PageMimeType,
	type QuestionSeed,
	extractStudentPaper,
} from "@/lib/gemini-extract"
import { logger } from "@/lib/logger"
import { getFileBase64, s3 } from "@/lib/s3"
import {
	type SqsEvent,
	markJobFailed,
	parseSqsJobId,
} from "@/lib/sqs-job-runner"
import {
	type VisionAttributeQuestion,
	visionAttributeRegions,
} from "@/lib/vision-attribute"
import { reconcilePageTokens } from "@/lib/vision-reconcile"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import {
	type ScanStatus,
	type Subject,
	logStudentPaperEvent,
} from "@mcp-gcse/db"
import { Resource } from "sst"

const TAG = "student-paper-extract"

const sqs = new SQSClient({})

type PageEntry = {
	key: string
	order: number
	mime_type: string
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

/**
 * Validates and narrows the raw JSON pages field from a StudentPaperJob row.
 * Throws if the value is null, not an array, or contains entries with the
 * wrong shape — a malformed pages field is a data integrity error, not a
 * recoverable condition.
 */
function parsePages(raw: unknown): PageEntry[] {
	if (!Array.isArray(raw)) {
		throw new Error(`job.pages is not an array (got ${typeof raw})`)
	}
	return raw.map((p: unknown, i: number) => {
		if (
			typeof p !== "object" ||
			p === null ||
			typeof (p as Record<string, unknown>).key !== "string" ||
			typeof (p as Record<string, unknown>).order !== "number" ||
			typeof (p as Record<string, unknown>).mime_type !== "string"
		) {
			throw new Error(
				`job.pages[${i}] has unexpected shape: ${JSON.stringify(p)}`,
			)
		}
		return p as PageEntry
	})
}

/**
 * Fetches the minimal question data needed for seeded extraction — just the
 * id, canonical number, text, and type for each question on the paper.
 * Does not load mark schemes or other heavyweight relations.
 */
async function loadQuestionSeeds(examPaperId: string): Promise<QuestionSeed[]> {
	const sections = await db.examSection.findMany({
		where: { exam_paper_id: examPaperId },
		orderBy: { order: "asc" },
		include: {
			exam_section_questions: {
				orderBy: { order: "asc" },
				include: {
					question: {
						select: {
							id: true,
							question_number: true,
							text: true,
							question_type: true,
						},
					},
				},
			},
		},
	})

	const seeds: QuestionSeed[] = []
	for (const section of sections) {
		for (const esq of section.exam_section_questions) {
			const questionNumber = esq.question.question_number
			if (!questionNumber) {
				// Positional fallback so the question still participates in
				// extraction and grading. The missing number is a data quality
				// issue that should be fixed on the exam paper, not silently
				// dropped from the student pipeline.
				const fallback = String(seeds.length + 1)
				logger.warn(
					TAG,
					"Question has no question_number — using positional fallback",
					{
						question_id: esq.question.id,
						exam_paper_id: examPaperId,
						fallback_number: fallback,
					},
				)
				seeds.push({
					question_id: esq.question.id,
					question_number: fallback,
					question_text: esq.question.text,
					question_type: esq.question.question_type,
				})
				continue
			}
			seeds.push({
				question_id: esq.question.id,
				question_number: questionNumber,
				question_text: esq.question.text,
				question_type: esq.question.question_type,
			})
		}
	}
	return seeds
}

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
					attempt_count: { increment: 1 },
					status: "processing" as ScanStatus,
					error: null,
				},
			})

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

			const rawSubject = extraction.detectedSubject?.trim().toLowerCase()
			const detectedSubject: Subject | null =
				rawSubject && isValidSubject(rawSubject) ? rawSubject : null

			await db.studentPaperJob.update({
				where: { id: jobId },
				data: {
					status: "text_extracted" as ScanStatus,
					student_name: extraction.studentName?.trim() || null,
					detected_subject: detectedSubject,
					extracted_answers_raw: {
						student_name: extraction.studentName?.trim() || null,
						answers: extraction.answers,
					},
					page_analyses: pageAnalyses,
					vision_raw_s3_key: visionRawKey,
					processed_at: new Date(),
					error: null,
				},
			})

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

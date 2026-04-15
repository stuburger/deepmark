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
	type QuestionTokenGroup,
	type TokenOffsetUpdate,
	alignTokensToAnswers,
} from "@/lib/scan-extraction/align-tokens-to-answer"
import { runVisionOcr } from "@/lib/scan-extraction/cloud-vision-ocr"
import {
	type PageMimeType,
	extractStudentPaper,
} from "@/lib/scan-extraction/gemini-extract"
import { persistTokens } from "@/lib/scan-extraction/persist-tokens"
import { saveVisionRaw } from "@/lib/scan-extraction/save-vision-raw"
import { preCorrectFromTranscripts } from "@/lib/scan-extraction/transcript-pre-correct"
import {
	type VisionAttributeQuestion,
	visionAttributeRegions,
} from "@/lib/scan-extraction/vision-attribute"
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
				extractStudentPaper(pageData, questionSeeds, llm),
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

			void logOcrRunEvent(db, jobId, {
				type: "answers_extracted",
				at: new Date().toISOString(),
				count: answersExtracted,
				student_name: extraction.studentName?.trim() || null,
			})

			// Persist student metadata on the submission
			await db.studentSubmission.update({
				where: { id: jobId },
				data: {
					student_name: extraction.studentName?.trim() || null,
					detected_subject: detectedSubject,
				},
			})

			// Persist extracted answers on the OcrRun so the UI can show them
			// while Vision token work (reconciliation + region attribution) runs below.
			await db.ocrRun.update({
				where: { id: jobId },
				data: {
					extracted_answers_raw: {
						student_name: extraction.studentName?.trim() || null,
						answers: extraction.answers,
					},
					page_analyses: pageAnalyses,
				},
			})

			const visionRawKey = await saveVisionRaw(
				jobId,
				bucket,
				sortedPages,
				visionResults,
			)

			const insertedTokens = await persistTokens(
				jobId,
				sortedPages,
				visionResults,
			)

			// Phase 1.5 — Pre-correct token text against Gemini page transcripts.
			// Deterministic Levenshtein alignment — no LLM call. Persists
			// text_corrected to DB so Phase 2b starts with better baseline text.
			// NOT fed into attribution — corrected text destabilises spatial
			// assignments (see bbox overlap regression).
			const transcriptCorrections = preCorrectFromTranscripts(
				insertedTokens,
				pageAnalyses,
			)
			if (transcriptCorrections.length > 0) {
				const CHUNK_SIZE = 50
				for (let i = 0; i < transcriptCorrections.length; i += CHUNK_SIZE) {
					const chunk = transcriptCorrections.slice(i, i + CHUNK_SIZE)
					await Promise.all(
						chunk.map((c) =>
							db.studentPaperPageToken.update({
								where: { id: c.id },
								data: { text_corrected: c.textCorrected },
							}),
						),
					)
				}
			}

			// Phase 2a — assign tokens to questions, derive answer regions.
			// Attribution sees raw text only — feeding corrected text into
			// the prompt destabilises spatial assignments (causes bbox overlap).
			// Pre-corrections are persisted to DB for Phase 2b to pick up.
			void logOcrRunEvent(db, jobId, {
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
			const rawTokensForAttribution = insertedTokens.map((t) => ({
				...t,
				text_corrected: null as string | null,
			}))
			await visionAttributeRegions({
				questions: attributeQuestions,
				extractedAnswers: extraction.answers,
				pages: sortedPages,
				s3Bucket: bucket,
				tokens: rawTokensForAttribution,
				jobId,
				llm,
			})

			// Phase 2b — token correction + answer mapping.
			// Text-only LLM: maps OCR tokens to answer words, corrects OCR text.
			// Outputs: text_corrected (OCR correction) + answer_char_start/end (word mapping).
			const answerByQuestion = new Map(
				extraction.answers.map((a) => [a.question_id, a.answer_text]),
			)
			const attributedTokens = await db.studentPaperPageToken.findMany({
				where: { submission_id: jobId, question_id: { not: null } },
				orderBy: [
					{ page_order: "asc" },
					{ para_index: "asc" },
					{ line_index: "asc" },
					{ word_index: "asc" },
				],
				select: {
					id: true,
					question_id: true,
					text_raw: true,
					text_corrected: true,
				},
			})
			const questionNumberById = new Map(
				questionSeeds.map((s) => [s.question_id, s.question_number]),
			)
			const questionGroups = buildQuestionGroups(
				attributedTokens,
				answerByQuestion,
				questionNumberById,
			)
			const tokenUpdates = await alignTokensToAnswers(questionGroups, llm)
			await persistTokenOffsets(tokenUpdates)

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

// ─── Helpers for Phase 2b ──────────────────────────────────────────────────

function buildQuestionGroups(
	tokens: Array<{
		id: string
		question_id: string | null
		text_raw: string
		text_corrected: string | null
	}>,
	answerByQuestion: Map<string, string>,
	questionNumberById: Map<string, string>,
): QuestionTokenGroup[] {
	const grouped = new Map<
		string,
		Array<{ id: string; text_raw: string; text_corrected: string | null }>
	>()
	for (const t of tokens) {
		if (!t.question_id) continue
		const list = grouped.get(t.question_id) ?? []
		list.push({
			id: t.id,
			text_raw: t.text_raw,
			text_corrected: t.text_corrected,
		})
		grouped.set(t.question_id, list)
	}

	const groups: QuestionTokenGroup[] = []
	for (const [questionId, qTokens] of grouped) {
		const answerText = answerByQuestion.get(questionId)
		if (!answerText) continue
		groups.push({
			questionId,
			questionNumber: questionNumberById.get(questionId) ?? "?",
			tokens: qTokens,
			answerText,
		})
	}
	return groups
}

async function persistTokenOffsets(
	updates: TokenOffsetUpdate[],
): Promise<void> {
	if (updates.length === 0) return
	const CHUNK_SIZE = 50
	for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
		const chunk = updates.slice(i, i + CHUNK_SIZE)
		await Promise.all(
			chunk.map((u) =>
				db.studentPaperPageToken.update({
					where: { id: u.id },
					data: {
						answer_char_start: u.charStart,
						answer_char_end: u.charEnd,
						...(u.textCorrected != null
							? { text_corrected: u.textCorrected }
							: {}),
					},
				}),
			),
		)
	}
}

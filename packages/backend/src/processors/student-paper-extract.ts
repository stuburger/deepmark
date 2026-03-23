import { db } from "@/db"
import { createCancellationToken } from "@/lib/cancellation"
import {
	type PageMimeType,
	type QuestionSeed,
	extractStudentPaper,
} from "@/lib/gemini-extract"
import { logger } from "@/lib/logger"
import { getFileBase64 } from "@/lib/s3"
import {
	type SqsEvent,
	markJobFailed,
	parseSqsJobId,
} from "@/lib/sqs-job-runner"
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
			seeds.push({
				question_id: esq.question.id,
				question_number:
					esq.question.question_number ?? String(seeds.length + 1),
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

			const pages = (job.pages ?? []) as PageEntry[]
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
				"Calling Gemini to extract student answers + per-page OCR",
				{ jobId, page_count: pageData.length },
			)

			const extraction = await extractStudentPaper(pageData, questionSeeds)

			if (cancellation.isCancelled()) {
				logger.info(
					TAG,
					"Job cancelled after Gemini call — skipping DB write",
					{ jobId },
				)
				continue
			}

			// Map each OCR result back to its page order number
			const pageAnalyses = extraction.ocrResults.map((analysis, i) => ({
				page: sortedPages[i]?.order ?? i + 1,
				analysis,
			}))

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

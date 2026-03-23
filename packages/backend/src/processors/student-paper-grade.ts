import { db } from "@/db"
import { alignAnswers } from "@/lib/answer-alignment"
import { createCancellationToken } from "@/lib/cancellation"
import { type PageEntry, attributeAnswerRegions } from "@/lib/gemini-region"
import { defaultChatModel } from "@/lib/google-generative-ai"
import { gradeAllQuestions } from "@/lib/grade-questions"
import { logger } from "@/lib/logger"
import { persistAnswerRows } from "@/lib/persist-answers"
import { loadQuestionList } from "@/lib/question-list"
import {
	type SqsEvent,
	markJobFailed,
	parseSqsJobId,
} from "@/lib/sqs-job-runner"
import { type ScanStatus, logStudentPaperEvent } from "@mcp-gcse/db"
import {
	DeterministicMarker,
	Grader,
	LevelOfResponseMarker,
	LlmMarker,
	MarkerOrchestrator,
} from "@mcp-gcse/shared"

const TAG = "student-paper-grade"

type ExtractedAnswersRaw = {
	student_name?: string | null
	answers: Array<{ question_number: string; answer_text: string }>
}

export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []

	const grader = new Grader(defaultChatModel(), {
		systemPrompt:
			"You are an expert GCSE examiner. Mark the student's answer against the provided mark scheme. Return valid JSON matching the schema. Ignore spelling and grammar; focus on understanding and correct concepts. Be consistent and conservative: only award marks when there is clear evidence.",
	})

	const orchestrator = new MarkerOrchestrator([
		new DeterministicMarker(),
		new LevelOfResponseMarker(grader),
		new LlmMarker(grader),
	])

	for (const record of event.Records) {
		const jobId = parseSqsJobId(record, TAG)
		if (!jobId) continue

		const cancellation = createCancellationToken(jobId)
		try {
			logger.info(TAG, "Grading job received", {
				jobId,
				messageId: record.messageId,
			})

			// ── 1. Load & validate job ────────────────────────────────────────
			const job = await db.studentPaperJob.findUniqueOrThrow({
				where: { id: jobId },
			})

			if (!job.extracted_answers_raw) {
				logger.warn(TAG, "Job has no extracted_answers_raw — run OCR first", {
					jobId,
				})
				await db.studentPaperJob.update({
					where: { id: jobId },
					data: {
						status: "failed" as ScanStatus,
						error: "No extracted answers — run OCR before grading",
					},
				})
				continue
			}

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

			// ── 2. Load exam paper + build question list ───────────────────────
			logger.info(TAG, "Loading exam paper questions and mark schemes", {
				jobId,
				exam_paper_id: job.exam_paper_id,
			})

			const examPaper = await db.examPaper.findUniqueOrThrow({
				where: { id: job.exam_paper_id },
				include: {
					sections: {
						orderBy: { order: "asc" },
						include: {
							exam_section_questions: {
								orderBy: { order: "asc" },
								include: {
									question: {
										include: {
											mark_schemes: {
												take: 1,
												orderBy: { created_at: "desc" },
											},
											question_parts: {
												include: {
													mark_schemes: {
														take: 1,
														orderBy: { created_at: "desc" },
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			})

			const questionList = loadQuestionList({ examPaper })

			logger.info(TAG, "Exam paper loaded", {
				jobId,
				question_count: questionList.length,
				questions_without_scheme: questionList.filter((q) => !q.mark_scheme)
					.length,
			})

			void logStudentPaperEvent(db, jobId, {
				type: "grading_started",
				at: new Date().toISOString(),
				questions_total: questionList.length,
			})

			// ── 3. Kick off region attribution in parallel with grading ────────
			const jobPages = (job.pages ?? []) as PageEntry[]
			void logStudentPaperEvent(db, jobId, {
				type: "region_attribution_started",
				at: new Date().toISOString(),
			})
			
			const regionAttributionPromise = attributeAnswerRegions(
				questionList.map((q) => ({
					question_id: q.question_id,
					question_number: q.question_number,
					question_text: q.question_text,
					is_mcq: q.question_obj.question_type === "multiple_choice",
				})),
				jobPages,
				job.s3_bucket,
				jobId,
			)

			// ── 4. Align answers ───────────────────────────────────────────────
			const extractedRaw = job.extracted_answers_raw as ExtractedAnswersRaw
			const rawAnswers = extractedRaw.answers ?? []

			const { answerMap, llmAlignmentMap } = await alignAnswers({
				questionList,
				rawAnswers,
				jobId,
			})

			// ── 5. Grade all questions ─────────────────────────────────────────
			const gradingResults = await gradeAllQuestions({
				questionList,
				answerMap,
				llmAlignmentMap,
				examPaper,
				orchestrator,
				jobId,
				cancellation,
			})

			if (cancellation.isCancelled()) {
				logger.info(TAG, "Job was cancelled — skipping completion", { jobId })
				continue
			}

			// ── 6. Merge answer regions ────────────────────────────────────────
			// Should mostly have resolved by now since grading takes longer than
			// Gemini Vision calls. Failures degrade gracefully.
			try {
				const regionMap = await regionAttributionPromise
				for (const r of gradingResults) {
					r.answer_regions = regionMap.get(r.question_id) ?? []
				}
				const questionsWithRegions = gradingResults.filter(
					(r) => r.answer_regions.length > 0,
				).length
				logger.info(TAG, "Answer regions merged into grading results", {
					jobId,
					questions_with_regions: questionsWithRegions,
				})
				void logStudentPaperEvent(db, jobId, {
					type: "region_attribution_complete",
					at: new Date().toISOString(),
					questions_located: questionsWithRegions,
				})
			} catch (err) {
				logger.error(
					TAG,
					"Region attribution failed — results saved without spatial data",
					{ jobId, error: String(err) },
				)
				for (const r of gradingResults) {
					r.answer_regions ??= []
				}
			}

			// ── 7. Final status DB write ───────────────────────────────────────
			const totalAwarded = gradingResults.reduce(
				(s, r) => s + r.awarded_score,
				0,
			)
			const totalMax = gradingResults.reduce((s, r) => s + r.max_score, 0)
			logger.info(TAG, "Grading job complete", {
				jobId,
				total_awarded: totalAwarded,
				total_max: totalMax,
				questions_graded: gradingResults.length,
			})

			await db.studentPaperJob.update({
				where: { id: jobId },
				data: {
					status: "ocr_complete" as ScanStatus,
					processed_at: new Date(),
					student_name:
						(
							job.extracted_answers_raw as ExtractedAnswersRaw
						).student_name?.trim() || job.student_name,
					grading_results: gradingResults,
					error: null,
				},
			})
			void logStudentPaperEvent(db, jobId, {
				type: "grading_complete",
				at: new Date().toISOString(),
				total_awarded: totalAwarded,
				total_max: totalMax,
			})

			// ── 8. Persist Answer + MarkingResult rows ─────────────────────────
			if (job.student_id) {
				await persistAnswerRows({
					gradingResults,
					studentId: job.student_id,
					jobId,
				})
			}
		} catch (err) {
			await markJobFailed(jobId, TAG, "grading", err)
			failures.push({ itemIdentifier: record.messageId })
		} finally {
			cancellation.stop()
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}

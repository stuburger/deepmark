import { db } from "@/db"
import {
	type CancellationToken,
	createCancellationToken,
} from "@/lib/cancellation"
import { type PageEntry, attributeAnswerRegions } from "@/lib/gemini-region"
import { defaultChatModel } from "@/lib/google-generative-ai"
import { type GradingResult, gradeAllQuestions } from "@/lib/grade-questions"
import { logger } from "@/lib/logger"
import { persistAnswerRows } from "@/lib/persist-answers"
import {
	type ExamPaperWithSections,
	type QuestionListItem,
	loadQuestionList,
} from "@/lib/question-list"
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

const EXAMINER_SYSTEM_PROMPT =
	"You are an expert GCSE examiner. Mark the student's answer against the provided mark scheme. Return valid JSON matching the schema. Ignore spelling and grammar; focus on understanding and correct concepts. Be consistent and conservative: only award marks when there is clear evidence."

type ExtractedAnswersRaw = {
	student_name?: string | null
	answers: Array<{ question_id: string; answer_text: string }>
}

type GradedJob = Awaited<
	ReturnType<typeof db.studentPaperJob.findUniqueOrThrow>
>

// ─── Public handler ────────────────────────────────────────────────────────────

export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []
	const grader = new Grader(defaultChatModel(), {
		systemPrompt: EXAMINER_SYSTEM_PROMPT,
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
			await gradeJob({ jobId, orchestrator, cancellation })
		} catch (err) {
			await markJobFailed(jobId, TAG, "grading", err)
			failures.push({ itemIdentifier: record.messageId })
		} finally {
			cancellation.stop()
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}

// ─── Domain: grade a single job ───────────────────────────────────────────────

type GradeJobArgs = {
	jobId: string
	orchestrator: MarkerOrchestrator
	cancellation: CancellationToken
}

async function gradeJob({
	jobId,
	orchestrator,
	cancellation,
}: GradeJobArgs): Promise<void> {
	logger.info(TAG, "Grading job received", { jobId })

	const job = await db.studentPaperJob.findUniqueOrThrow({
		where: { id: jobId },
	})

	if (!job.extracted_answers_raw) {
		return await rejectJobMissingOcr(jobId)
	}

	if (job.status === "cancelled") {
		logger.info(TAG, "Job was cancelled — skipping", { jobId })
		return
	}

	await markJobAsProcessing(jobId)

	const examPaper = await loadExamPaperForGrading(job.exam_paper_id)
	const questionList = loadQuestionList({ examPaper })

	logger.info(TAG, "Exam paper loaded", {
		jobId,
		exam_paper_id: job.exam_paper_id,
		question_count: questionList.length,
		questions_without_scheme: questionList.filter((q) => !q.mark_scheme).length,
	})

	void logStudentPaperEvent(db, jobId, {
		type: "grading_started",
		at: new Date().toISOString(),
		questions_total: questionList.length,
	})

	// Region attribution runs fully independently — rows are written to
	// student_paper_answer_regions as each page resolves, so the frontend
	// can poll for them without waiting for grading to finish.
	void beginRegionAttribution({ questionList, job, jobId })

	const answerMap = new Map(
		extractRawAnswers(job).map((a) => [a.question_id, a.answer_text]),
	)

	logger.info(TAG, "Answer map built", { jobId, answer_count: answerMap.size })

	const gradingResults = await gradeAllQuestions({
		questionList,
		answerMap,
		examPaper,
		orchestrator,
		jobId,
		cancellation,
	})

	if (cancellation.isCancelled()) {
		logger.info(TAG, "Job was cancelled — skipping completion", { jobId })
		return
	}

	await completeGradingJob({ job, gradingResults, jobId })
}

// ─── Data access ──────────────────────────────────────────────────────────────

async function loadExamPaperForGrading(
	examPaperId: string,
): Promise<ExamPaperWithSections> {
	return db.examPaper.findUniqueOrThrow({
		where: { id: examPaperId },
		include: {
			sections: {
				orderBy: { order: "asc" },
				include: {
					exam_section_questions: {
						orderBy: { order: "asc" },
						include: {
							question: {
								include: {
									mark_schemes: { take: 1, orderBy: { created_at: "desc" } },
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
}

// ─── Job lifecycle steps ──────────────────────────────────────────────────────

async function rejectJobMissingOcr(jobId: string): Promise<void> {
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
}

async function markJobAsProcessing(jobId: string): Promise<void> {
	await db.studentPaperJob.update({
		where: { id: jobId },
		data: {
			attempt_count: { increment: 1 },
			status: "processing" as ScanStatus,
			error: null,
		},
	})
}

function extractRawAnswers(
	job: Pick<GradedJob, "extracted_answers_raw">,
): Array<{ question_id: string; answer_text: string }> {
	const raw = job.extracted_answers_raw as ExtractedAnswersRaw
	return raw.answers ?? []
}

function beginRegionAttribution({
	questionList,
	job,
	jobId,
}: {
	questionList: QuestionListItem[]
	job: Pick<GradedJob, "pages" | "s3_bucket">
	jobId: string
}): void {
	void logStudentPaperEvent(db, jobId, {
		type: "region_attribution_started",
		at: new Date().toISOString(),
	})

	// attributeAnswerRegions writes rows to student_paper_answer_regions as
	// each page resolves and fires region_attribution_complete itself.
	void attributeAnswerRegions({
		questions: questionList.map((q) => ({
			question_id: q.question_id,
			question_number: q.question_number,
			question_text: q.question_text,
			is_mcq: q.question_obj.question_type === "multiple_choice",
		})),
		pages: (job.pages ?? []) as PageEntry[],
		s3Bucket: job.s3_bucket,
		jobId,
	}).catch((err) => {
		logger.error(TAG, "Region attribution failed", {
			jobId,
			error: String(err),
		})
	})
}

async function completeGradingJob({
	job,
	gradingResults,
	jobId,
}: {
	job: Pick<GradedJob, "extracted_answers_raw" | "student_name" | "student_id">
	gradingResults: GradingResult[]
	jobId: string
}): Promise<void> {
	const totalAwarded = gradingResults.reduce((s, r) => s + r.awarded_score, 0)
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

	if (job.student_id) {
		await persistAnswerRows({
			gradingResults,
			studentId: job.student_id,
			jobId,
		})
	}
}

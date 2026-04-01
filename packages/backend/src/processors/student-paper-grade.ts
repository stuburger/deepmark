import { db } from "@/db"
import {
	type CancellationToken,
	createCancellationToken,
} from "@/lib/cancellation"
import { defaultChatModel } from "@/lib/google-generative-ai"
import { type GradingResult, gradeAllQuestions } from "@/lib/grade-questions"
import { logger } from "@/lib/logger"
import { persistAnswerRows } from "@/lib/persist-answers"
import { sendBatchCompleteNotification } from "@/lib/push-notification"
import { type QuestionListItem, loadQuestionList } from "@/lib/question-list"
import {
	type SqsEvent,
	markJobFailed,
	parseSqsJobId,
} from "@/lib/sqs-job-runner"
import { loadExamPaperForGrading } from "@/lib/student-paper/grade-queries"
import { EXAMINER_SYSTEM_PROMPT } from "@/lib/student-paper/grader-config"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { type ScanStatus, logStudentPaperEvent } from "@mcp-gcse/db"
import {
	DeterministicMarker,
	Grader,
	LevelOfResponseMarker,
	LlmMarker,
	MarkerOrchestrator,
} from "@mcp-gcse/shared"
import { Resource } from "sst"

const TAG = "student-paper-grade"

const sqs = new SQSClient({})

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
	const raw = job.extracted_answers_raw as unknown
	if (
		typeof raw !== "object" ||
		raw === null ||
		!Array.isArray((raw as Record<string, unknown>).answers)
	) {
		throw new Error(
			"extracted_answers_raw is missing or has no answers array — extract lambda may not have completed",
		)
	}
	return (raw as ExtractedAnswersRaw).answers
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

	const updatedJob = await db.studentPaperJob.update({
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
		select: { batch_job_id: true },
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

	if (updatedJob.batch_job_id) {
		await checkAndNotifyBatchCompletion(updatedJob.batch_job_id)
	}

	await sqs.send(
		new SendMessageCommand({
			QueueUrl: Resource.StudentPaperEnrichQueue.url,
			MessageBody: JSON.stringify({ job_id: jobId }),
		}),
	)
}

// ─── Batch completion check ───────────────────────────────────────────────────

const TERMINAL_STATUSES = ["ocr_complete", "failed", "cancelled"]

/**
 * Atomically checks whether all child jobs for a batch are in a terminal
 * status and, if so, marks the batch complete and sends a push notification.
 * Uses an UPDATE...WHERE pattern so only one Lambda invocation can win the race.
 * Safe to call multiple times — idempotent once notification_sent_at is set.
 */
export async function checkAndNotifyBatchCompletion(
	batchJobId: string,
): Promise<void> {
	const batch = await db.batchIngestJob.findUnique({
		where: { id: batchJobId },
		select: {
			id: true,
			total_student_jobs: true,
			notification_sent_at: true,
			uploaded_by: true,
			exam_paper: { select: { title: true } },
		},
	})

	if (!batch || batch.notification_sent_at || batch.total_student_jobs === 0) {
		return
	}

	const terminalCount = await db.studentPaperJob.count({
		where: {
			batch_job_id: batchJobId,
			status: { in: TERMINAL_STATUSES as ScanStatus[] },
		},
	})

	if (terminalCount < batch.total_student_jobs) return

	const now = new Date()
	const updated = await db.batchIngestJob.updateMany({
		where: { id: batchJobId, notification_sent_at: null },
		data: { status: "complete", notification_sent_at: now },
	})

	if (updated.count === 0) return

	logger.info(TAG, "Batch complete — sending push notification", {
		batchJobId,
		studentCount: batch.total_student_jobs,
	})

	await sendBatchCompleteNotification(
		batchJobId,
		batch.uploaded_by,
		batch.exam_paper.title,
		batch.total_student_jobs,
	)
}

import { db } from "@/db"
import { loadExamPaperForGrading } from "@/lib/grading/grade-queries"
import {
	type GradingResult,
	gradeAllQuestions,
} from "@/lib/grading/grade-questions"
import { createMarkerOrchestrator } from "@/lib/grading/grader-config"
import { persistAnswerRows } from "@/lib/grading/persist-answers"
import {
	type QuestionListItem,
	loadQuestionList,
} from "@/lib/grading/question-list"
import {
	type CancellationToken,
	createCancellationToken,
} from "@/lib/infra/cancellation"
import { createLlmRunner } from "@/lib/infra/llm-runtime"
import { logger } from "@/lib/infra/logger"
import { sendBatchCompleteNotification } from "@/lib/infra/push-notification"
import {
	type SqsEvent,
	markJobFailed,
	parseSqsJobId,
} from "@/lib/infra/sqs-job-runner"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { type GradingStatus, logGradingRunEvent } from "@mcp-gcse/db"
import type { LlmRunner, MarkerOrchestrator } from "@mcp-gcse/shared"
import { Resource } from "sst"

const TAG = "student-paper-grade"

const sqs = new SQSClient({})

type ExtractedAnswersRaw = {
	student_name?: string | null
	answers: Array<{ question_id: string; answer_text: string }>
}

type SubmissionWithOcr = Awaited<
	ReturnType<typeof db.studentSubmission.findUniqueOrThrow>
> & { ocr_runs: Awaited<ReturnType<typeof db.ocrRun.findMany>> }

// ─── Public handler ────────────────────────────────────────────────────────────

export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []

	for (const record of event.Records) {
		const jobId = parseSqsJobId(record, TAG)
		if (!jobId) continue

		const cancellation = createCancellationToken(jobId)
		try {
			const llm = createLlmRunner()
			const orchestrator = await createMarkerOrchestrator(llm)
			await gradeJob({ jobId, orchestrator, llm, cancellation })
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
	llm: LlmRunner
	cancellation: CancellationToken
}

async function gradeJob({
	jobId,
	orchestrator,
	llm,
	cancellation,
}: GradeJobArgs): Promise<void> {
	logger.info(TAG, "Grading job received", { jobId })

	const sub = await db.studentSubmission.findUniqueOrThrow({
		where: { id: jobId },
		include: {
			ocr_runs: { orderBy: { created_at: "desc" }, take: 1 },
		},
	})
	const latestOcr = sub.ocr_runs[0]

	if (!latestOcr?.extracted_answers_raw) {
		return await rejectJobMissingOcr(jobId)
	}

	await markJobAsGrading(jobId)

	const examPaper = await loadExamPaperForGrading(sub.exam_paper_id)
	const questionList = loadQuestionList({ examPaper })

	logger.info(TAG, "Exam paper loaded", {
		jobId,
		exam_paper_id: sub.exam_paper_id,
		question_count: questionList.length,
		questions_without_scheme: questionList.filter((q) => !q.mark_scheme).length,
	})

	void logGradingRunEvent(db, jobId, {
		type: "grading_started",
		at: new Date().toISOString(),
		questions_total: questionList.length,
	})

	const answerMap = new Map(
		extractRawAnswers(latestOcr!).map((a) => [a.question_id, a.answer_text]),
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

	await completeGradingJob({ sub, ocrRun: latestOcr!, gradingResults, jobId })

	// Write LLM snapshot — informational, not critical
	await db.gradingRun
		.update({
			where: { id: jobId },
			data: { llm_snapshot: llm.toSnapshot() },
		})
		.catch((err) =>
			logger.warn(TAG, "Failed to write LLM snapshot", {
				jobId,
				error: String(err),
			}),
		)
}

// ─── Job lifecycle steps ──────────────────────────────────────────────────────

async function rejectJobMissingOcr(jobId: string): Promise<void> {
	logger.warn(TAG, "Job has no extracted_answers_raw — run OCR first", {
		jobId,
	})
	await db.ocrRun
		.update({
			where: { id: jobId },
			data: {
				status: "failed",
				error: "No extracted answers — run OCR before grading",
			},
		})
		.catch(() => {})
}

async function markJobAsGrading(jobId: string): Promise<void> {
	await db.gradingRun.upsert({
		where: { id: jobId },
		create: {
			id: jobId,
			submission_id: jobId,
			ocr_run_id: jobId,
			status: "processing" satisfies GradingStatus,
			started_at: new Date(),
		},
		update: {
			status: "processing" satisfies GradingStatus,
			error: null,
			started_at: new Date(),
		},
	})
}

function extractRawAnswers(source: { extracted_answers_raw: unknown }): Array<{
	question_id: string
	answer_text: string
}> {
	const raw = source.extracted_answers_raw as unknown
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
	sub,
	ocrRun,
	gradingResults,
	jobId,
}: {
	sub: SubmissionWithOcr
	ocrRun: { extracted_answers_raw: unknown }
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

	// Update student_name on submission if OCR extracted one
	const extractedName = (
		ocrRun.extracted_answers_raw as ExtractedAnswersRaw
	).student_name?.trim()
	if (extractedName && extractedName !== sub.student_name) {
		await db.studentSubmission.update({
			where: { id: jobId },
			data: { student_name: extractedName },
		})
	}

	// Mark GradingRun complete
	await db.gradingRun.update({
		where: { id: jobId },
		data: {
			status: "complete" satisfies GradingStatus,
			grading_results: gradingResults,
			completed_at: new Date(),
			error: null,
		},
	})

	void logGradingRunEvent(db, jobId, {
		type: "grading_complete",
		at: new Date().toISOString(),
		total_awarded: totalAwarded,
		total_max: totalMax,
	})

	if (sub.student_id) {
		await persistAnswerRows({
			gradingResults,
			studentId: sub.student_id,
			jobId,
		})
	}

	if (sub.batch_job_id) {
		await checkAndNotifyBatchCompletion(sub.batch_job_id)
	}

	// Pass grading_run_id as job_id so the enrich processor can look up EnrichmentRun directly
	// (grading_run_id === jobId by the migration convention)
	await sqs.send(
		new SendMessageCommand({
			QueueUrl: Resource.StudentPaperEnrichQueue.url,
			MessageBody: JSON.stringify({ job_id: jobId }),
		}),
	)
}

// ─── Batch completion check ───────────────────────────────────────────────────

/**
 * Atomically checks whether all child submissions for a batch have a terminal
 * grading run and, if so, marks the batch complete and sends a push notification.
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

	const terminalCount = await db.studentSubmission.count({
		where: {
			batch_job_id: batchJobId,
			grading_runs: {
				some: { status: { in: ["complete", "failed", "cancelled"] } },
			},
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

	try {
		await sendBatchCompleteNotification(
			batchJobId,
			batch.uploaded_by,
			batch.exam_paper.title,
			batch.total_student_jobs,
		)
	} catch (err) {
		logger.error(TAG, "Push notification failed — batch still complete", {
			batchJobId,
			error: err instanceof Error ? err.message : String(err),
		})
	}
}

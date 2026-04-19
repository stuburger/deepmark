import { db } from "@/db"
import { loadAnnotationContext } from "@/lib/annotations/data-loading"
import { persistAnnotations } from "@/lib/annotations/persist-annotations"
import type { PendingAnnotation } from "@/lib/annotations/types"
import { generateExaminerSummary } from "@/lib/grading/examiner-summary"
import { loadExamPaperForGrading } from "@/lib/grading/grade-queries"
import {
	type GradingResult,
	gradeAndAnnotateAll,
} from "@/lib/grading/grade-questions"
import { createMarkerOrchestrator } from "@/lib/grading/grader-config"
import { persistAnswerRows } from "@/lib/grading/persist-answers"
import { loadQuestionList } from "@/lib/grading/question-list"
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
import { type GradingStatus, logGradingRunEvent } from "@mcp-gcse/db"
import type { LlmRunner, MarkerOrchestrator } from "@mcp-gcse/shared"

const TAG = "student-paper-grade"

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
			const annotationLlm = createLlmRunner()
			const orchestrator = createMarkerOrchestrator(llm)
			await gradeJob({ jobId, orchestrator, llm, annotationLlm, cancellation })
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
	annotationLlm: LlmRunner
	cancellation: CancellationToken
}

async function gradeJob({
	jobId,
	orchestrator,
	llm,
	annotationLlm,
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
		// biome-ignore lint/style/noNonNullAssertion: latestOcr verified non-null above
		extractRawAnswers(latestOcr!).map((a) => [a.question_id, a.answer_text]),
	)

	logger.info(TAG, "Answer map built", { jobId, answer_count: answerMap.size })

	// Annotation context must be loaded before grading so each question can
	// grade → annotate in the same Promise.all pass.
	const annotationContext = await loadAnnotationContext(jobId)

	const { results: gradingResults, annotationsByQuestion } =
		await gradeAndAnnotateAll({
			questionList,
			answerMap,
			examPaper,
			orchestrator,
			jobId,
			cancellation,
			annotationContext,
			annotationLlm,
		})

	if (cancellation.isCancelled()) {
		logger.info(TAG, "Job was cancelled — skipping completion", { jobId })
		return
	}

	const examinerSummary = await generateExaminerSummary({
		gradingResults,
		examPaperTitle: examPaper.title,
		subject: examPaper.subject,
		runner: llm,
	})

	await completeGradingJob({
		sub,
		// biome-ignore lint/style/noNonNullAssertion: latestOcr verified non-null above
		ocrRun: latestOcr!,
		gradingResults,
		annotationsByQuestion,
		jobId,
		examinerSummary,
	})

	// Write LLM snapshots — informational, not critical
	await db.gradingRun
		.update({
			where: { id: jobId },
			data: {
				llm_snapshot: llm.toSnapshot(),
				annotation_llm_snapshot: annotationLlm.toSnapshot(),
			},
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

type CompleteGradingJobArgs = {
	sub: SubmissionWithOcr
	ocrRun: { extracted_answers_raw: unknown }
	gradingResults: GradingResult[]
	annotationsByQuestion: Map<string, PendingAnnotation[]>
	jobId: string
	examinerSummary: string | null
}

async function completeGradingJob(args: CompleteGradingJobArgs): Promise<void> {
	const totals = computeTotals(args.gradingResults)

	logger.info(TAG, "Grading job complete", {
		jobId: args.jobId,
		total_awarded: totals.totalAwarded,
		total_max: totals.totalMax,
		questions_graded: args.gradingResults.length,
	})

	await updateStudentNameIfExtracted(args.jobId, args.sub, args.ocrRun)
	const annotationError = await persistAnnotationsBestEffort(
		args.jobId,
		args.annotationsByQuestion,
	)
	await markGradingRunComplete({
		jobId: args.jobId,
		gradingResults: args.gradingResults,
		examinerSummary: args.examinerSummary,
		annotationError,
	})
	logGradingCompleteEvent(args.jobId, totals)
	await persistAnswerRowsIfLinked(args)
	await notifyBatchIfComplete(args.sub.batch_job_id)
}

function computeTotals(gradingResults: GradingResult[]): {
	totalAwarded: number
	totalMax: number
} {
	return {
		totalAwarded: gradingResults.reduce((s, r) => s + r.awarded_score, 0),
		totalMax: gradingResults.reduce((s, r) => s + r.max_score, 0),
	}
}

async function updateStudentNameIfExtracted(
	jobId: string,
	sub: SubmissionWithOcr,
	ocrRun: { extracted_answers_raw: unknown },
): Promise<void> {
	const extractedName = (
		ocrRun.extracted_answers_raw as ExtractedAnswersRaw
	).student_name?.trim()
	if (!extractedName || extractedName === sub.student_name) return
	await db.studentSubmission.update({
		where: { id: jobId },
		data: { student_name: extractedName },
	})
}

/**
 * Persist annotations alongside grading (replaces the old enrichment queue hop).
 * Each question already has a best-effort result — failed per-question annotate
 * calls return []. Surface any insert failure as annotation_error without
 * blocking grading completion.
 */
async function persistAnnotationsBestEffort(
	jobId: string,
	annotationsByQuestion: Map<string, PendingAnnotation[]>,
): Promise<string | null> {
	const perQuestionGroups: PendingAnnotation[][] = Array.from(
		annotationsByQuestion.values(),
	)
	const totalAnnotations = perQuestionGroups.reduce((s, g) => s + g.length, 0)

	try {
		await persistAnnotations(jobId, perQuestionGroups)
		logger.info(TAG, "Annotations persisted", {
			jobId,
			total: totalAnnotations,
		})
		return null
	} catch (err) {
		const annotationError = err instanceof Error ? err.message : String(err)
		logger.error(TAG, "Failed to persist annotations", {
			jobId,
			error: annotationError,
		})
		return annotationError
	}
}

async function markGradingRunComplete({
	jobId,
	gradingResults,
	examinerSummary,
	annotationError,
}: {
	jobId: string
	gradingResults: GradingResult[]
	examinerSummary: string | null
	annotationError: string | null
}): Promise<void> {
	await db.gradingRun.update({
		where: { id: jobId },
		data: {
			status: "complete" satisfies GradingStatus,
			grading_results: gradingResults,
			examiner_summary: examinerSummary,
			completed_at: new Date(),
			annotations_completed_at: annotationError ? null : new Date(),
			annotation_error: annotationError,
			error: null,
		},
	})
}

function logGradingCompleteEvent(
	jobId: string,
	totals: { totalAwarded: number; totalMax: number },
): void {
	void logGradingRunEvent(db, jobId, {
		type: "grading_complete",
		at: new Date().toISOString(),
		total_awarded: totals.totalAwarded,
		total_max: totals.totalMax,
	})
}

async function persistAnswerRowsIfLinked(
	args: CompleteGradingJobArgs,
): Promise<void> {
	if (!args.sub.student_id) return
	await persistAnswerRows({
		gradingResults: args.gradingResults,
		studentId: args.sub.student_id,
		jobId: args.jobId,
	})
}

async function notifyBatchIfComplete(batchJobId: string | null): Promise<void> {
	if (!batchJobId) return
	await checkAndNotifyBatchCompletion(batchJobId)
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

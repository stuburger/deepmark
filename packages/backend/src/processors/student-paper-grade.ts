import { db } from "@/db"
import { loadAnnotationContext } from "@/lib/annotations/data-loading"
import type { PendingAnnotation } from "@/lib/annotations/types"
import {
	type PerQuestionAnswer,
	type QuestionSkeleton,
	dispatchExtractedDoc,
	withHeadlessEditor,
} from "@/lib/collab/editor-seed"
import { loadTokensByQuestion } from "@/lib/collab/load-tokens"
import { claimGradingRun } from "@/lib/grading/claim-grading-run"
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
import {
	type LlmRunner,
	type MarkerOrchestrator,
	insertExaminerSummary,
} from "@mcp-gcse/shared"

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

	// Atomic claim BEFORE any other work — guarantees at most one grade
	// Lambda is mid-flight per submission_id at any time. Without this,
	// two concurrent invocations (SQS at-least-once redelivery, OCR
	// Lambda retry that re-sends the grade message, double-clicked
	// re-grade) both open empty CRDT replicas, both insert blocks, Yjs
	// merges into 2× of every block. See `claimGradingRun` docstring.
	const claim = await claimGradingRun(db.gradingRun, jobId)
	if (!claim.ok) {
		logger.info(TAG, "Skipping duplicate grade invocation", {
			jobId,
			reason: claim.reason,
		})
		return
	}

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

	// Annotation context + per-question tokens loaded once for the whole
	// grade pass. Tokens map is read inside each per-question dispatch to
	// resolve annotation char ranges — preloaded so the per-question loop
	// stays synchronous from the editor's perspective.
	const [annotationContext, tokensByQuestion] = await Promise.all([
		loadAnnotationContext(jobId),
		loadTokensByQuestion(jobId),
	])

	// One editor session for the whole grade Lambda invocation. The session
	// is responsible for both:
	//
	//   1. Projecting the OCR doc shape (skeleton blocks, MCQ table,
	//      stitched answer_text per question, ocrToken marks for the scan
	//      overlay). This is a one-shot bootstrap: setAnswerText is
	//      idempotent (skip-if-text-exists), so the second time the grade
	//      Lambda runs against a doc that already has content (a manual
	//      retry, say), the projection is a no-op for any block the
	//      teacher has populated.
	//
	//   2. Dispatching per-question scores + AI annotation marks as each
	//      grade completes inside `gradeAndAnnotateAll`, so the teacher's
	//      view fills in progressively.
	//
	// The grade Lambda is the *only* place that writes to the Y.Doc — re-grade
	// (which creates a new submission with a fresh empty Y.Doc and bypasses
	// the OCR Lambda entirely) gets the same code path as the original
	// flow, no special-casing required.
	const skeletons = buildSkeletonsFromQuestionList(questionList)
	const perQuestion = buildPerQuestionAnswers(answerMap, tokensByQuestion)

	const { gradingResults, annotationsByQuestion } = await withHeadlessEditor(
		jobId,
		"grade-job",
		async (editor) => {
			dispatchExtractedDoc(editor, skeletons, perQuestion)

			const out = await gradeAndAnnotateAll({
				questionList,
				answerMap,
				examPaper,
				orchestrator,
				jobId,
				cancellation,
				annotationContext,
				annotationLlm,
				editor,
				tokensByQuestion,
			})
			return {
				gradingResults: out.results,
				annotationsByQuestion: out.annotationsByQuestion,
			}
		},
	)

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

	// Push the AI summary into the prosemirror doc as a leading paragraph so
	// teachers see and can edit it inline alongside the per-question feedback.
	// The DB column (`examiner_summary`) is still written below in
	// `completeGradingJob` for non-realtime consumers (PDF export, etc.).
	if (examinerSummary && !cancellation.isCancelled()) {
		await withHeadlessEditor(jobId, "examiner-summary", (editor) =>
			editor.transact((view) => insertExaminerSummary(view, examinerSummary)),
		)
	}

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

/**
 * Convert the loaded `questionList` into the `QuestionSkeleton[]` shape
 * `dispatchExtractedDoc` consumes. Carries the MCQ-specific fields
 * (`question_type`, `options`, `correctLabels`) so the projection
 * branches on `multiple_choice` and packs them into a single `mcqTable`
 * block at the top of the doc.
 */
function buildSkeletonsFromQuestionList(
	questionList: Array<{
		question_id: string
		question_number: string
		question_text: string
		question_obj: {
			question_type: string
			points: number | null
			multiple_choice_options: unknown
		}
		mark_scheme: { correct_option_labels: string[] } | null
	}>,
): QuestionSkeleton[] {
	return questionList.map((q) => ({
		questionId: q.question_id,
		questionNumber: q.question_number,
		questionText: q.question_text,
		maxScore: q.question_obj.points,
		questionType: q.question_obj.question_type,
		options:
			(q.question_obj.multiple_choice_options as Array<{
				option_label: string
				option_text: string
			}>) ?? [],
		correctLabels: q.mark_scheme?.correct_option_labels ?? [],
	}))
}

/**
 * Build the `PerQuestionAnswer[]` payload from the OCR-extracted answer map
 * + per-question token map. Skips entries with no answer_text — empty
 * blocks stay empty.
 */
function buildPerQuestionAnswers(
	answerMap: Map<string, string>,
	tokensByQuestion: Map<
		string,
		Awaited<ReturnType<typeof loadTokensByQuestion>> extends Map<
			string,
			infer T
		>
			? T
			: never
	>,
): PerQuestionAnswer[] {
	const out: PerQuestionAnswer[] = []
	for (const [questionId, text] of answerMap) {
		if (text.trim().length === 0) continue
		out.push({
			questionId,
			text,
			tokens: tokensByQuestion.get(questionId) ?? [],
		})
	}
	return out
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
	// AI annotation marks were already dispatched per-question inside
	// `gradeAndAnnotateAll`, against the editor session opened by `gradeJob`
	// — by the time we get here, the doc has every mark and the session is
	// closed. Nothing more to do for the editor; just record the run as
	// complete on the DB and notify downstream.
	await markGradingRunComplete({
		jobId: args.jobId,
		examinerSummary: args.examinerSummary,
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

async function markGradingRunComplete({
	jobId,
	examinerSummary,
}: {
	jobId: string
	examinerSummary: string | null
}): Promise<void> {
	// `grading_results` is no longer written here — the doc is the source
	// of truth for per-question grade metadata, and the projection Lambda
	// (annotation-projection.ts) mirrors it onto this column on every
	// snapshot via `writeGradingResults`. We only own the lifecycle
	// fields (status, timestamps, errors) + paper-level metadata
	// (examiner_summary).
	await db.gradingRun.update({
		where: { id: jobId },
		data: {
			status: "complete" satisfies GradingStatus,
			examiner_summary: examinerSummary,
			completed_at: new Date(),
			annotations_completed_at: new Date(),
			annotation_error: null,
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

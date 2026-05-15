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
import { emitEvent } from "@/lib/events/emit"
import { claimGradingRun } from "@/lib/grading/claim-grading-run"
import { generateExaminerSummary } from "@/lib/grading/examiner-summary"
import { loadExamPaperForGrading } from "@/lib/grading/grade-queries"
import {
	type GradingResult,
	gradeAndAnnotateAll,
} from "@/lib/grading/grade-questions"
import { createMarkerOrchestrator } from "@/lib/grading/grader-config"
import {
	type ExamPaperWithSections,
	loadQuestionList,
} from "@/lib/grading/question-list"
import {
	type CancellationToken,
	createCancellationToken,
} from "@/lib/infra/cancellation"
import { llmTimeoutFromContext } from "@/lib/infra/lambda-envelope"
import { createLlmRunner } from "@/lib/infra/llm-runtime"
import { logger } from "@/lib/infra/logger"
import {
	type SqsEvent,
	markJobFailed,
	parseSqsJobId,
} from "@/lib/infra/sqs-job-runner"
import { type GradingStatus, logGradingRunEvent } from "@mcp-gcse/db"
import { EventDetailType, EventSource } from "@mcp-gcse/emails"
import {
	type LlmRunner,
	type LlmTimeoutMs,
	type MarkerOrchestrator,
	insertExaminerSummary,
	resolveSectionResults,
	sectionExpectedMax,
} from "@mcp-gcse/shared"
import type { Context } from "aws-lambda"

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
	context?: Context,
): Promise<void> {
	// Queue is configured with `batch: { size: 1 }`, so SQS delivers one
	// record per invocation. Throwing is the correct way to fail — SQS sees
	// it, redelivers up to maxReceiveCount, then routes to the DLQ.
	const [record] = event.Records
	if (!record) return

	const jobId = parseSqsJobId(record, TAG)
	if (!jobId) return

	const cancellation = createCancellationToken(jobId)
	const timeoutMs = llmTimeoutFromContext(context)
	try {
		const llm = createLlmRunner()
		const annotationLlm = createLlmRunner()
		const orchestrator = createMarkerOrchestrator(llm, { timeoutMs })
		await gradeJob({
			jobId,
			orchestrator,
			llm,
			annotationLlm,
			cancellation,
			timeoutMs,
		})
	} catch (err) {
		await markJobFailed(jobId, TAG, "grading", err)
		throw err
	} finally {
		cancellation.stop()
	}
}

// ─── Domain: grade a single job ───────────────────────────────────────────────

type GradeJobArgs = {
	jobId: string
	orchestrator: MarkerOrchestrator
	llm: LlmRunner
	annotationLlm: LlmRunner
	cancellation: CancellationToken
	timeoutMs?: LlmTimeoutMs
}

async function gradeJob({
	jobId,
	orchestrator,
	llm,
	annotationLlm,
	cancellation,
	timeoutMs,
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
				timeoutMs,
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
		timeoutMs,
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
		examPaper,
		answerMap,
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
	examPaper: ExamPaperWithSections
	answerMap: Map<string, string>
}

async function completeGradingJob(args: CompleteGradingJobArgs): Promise<void> {
	const totals = computeTotals(
		args.gradingResults,
		args.examPaper,
		args.answerMap,
		args.jobId,
	)

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
	//
	// Answer + MarkingResult rows are NOT written here. They are projected
	// from the Yjs doc by `annotation-projection.ts` on the next snapshot,
	// alongside annotations / grading_results JSON / examiner summary /
	// teacher overrides. Single writer, derived from one input.
	await markGradingRunComplete({
		jobId: args.jobId,
		examinerSummary: args.examinerSummary,
	})
	logGradingCompleteEvent(args.jobId, totals)
	await notifyBatchIfComplete(args.sub.processing_batch_id)
}

/**
 * Choice-aware paper-level totals.
 *
 * For each section in the exam paper:
 *   - Group its grading results, tag each with `has_answer` derived from the
 *     OCR answer map (a stub result for an empty answer has has_answer=false
 *     and ranks below any real attempt).
 *   - Apply `resolveSectionResults` to pick the questions that count toward
 *     the awarded score (for `kind=all` that's everything; for
 *     `kind=any_n_of(n)` it's the top-n ranked by has_answer + awarded +
 *     max).
 *   - Use `sectionExpectedMax` for the section's contribution to the paper
 *     denominator so a student who answered 0/N still preserves the right
 *     "/ X" total.
 *
 * Anomaly logging: if the persisted `section.total_marks` disagrees with
 * the choice-aware ceiling, emit a warn. The common signal is "extractor
 * shipped choice_kind=all but the printed total implies the section is
 * really any_n_of" — a teacher reviewing the paper will want to fix the
 * choice rule before grading more submissions.
 *
 * Orphan results (rare — a graded question_id with no section link) fall
 * back to naive sum so we never silently drop a mark, but the count is
 * logged loudly.
 */
function computeTotals(
	gradingResults: GradingResult[],
	examPaper: ExamPaperWithSections,
	answerMap: Map<string, string>,
	jobId: string,
): { totalAwarded: number; totalMax: number } {
	// question_id → section index in examPaper.sections
	const sectionIndexByQuestion = new Map<string, number>()
	examPaper.sections.forEach((section, sectionIdx) => {
		for (const esq of section.exam_section_questions) {
			sectionIndexByQuestion.set(esq.question.id, sectionIdx)
		}
	})

	// Group results by section.
	const resultsBySection = new Map<number, GradingResult[]>()
	const orphans: GradingResult[] = []
	for (const r of gradingResults) {
		const idx = sectionIndexByQuestion.get(r.question_id)
		if (idx === undefined) {
			orphans.push(r)
			continue
		}
		const bucket = resultsBySection.get(idx) ?? []
		bucket.push(r)
		resultsBySection.set(idx, bucket)
	}

	let totalAwarded = 0
	let totalMax = 0

	examPaper.sections.forEach((section, sectionIdx) => {
		const sectionResults = resultsBySection.get(sectionIdx) ?? []
		const annotated = sectionResults.map((r) => ({
			...r,
			has_answer: (answerMap.get(r.question_id) ?? "").trim().length > 0,
		}))
		const { included } = resolveSectionResults(section, annotated)
		const sectionAwarded = included.reduce((s, r) => s + r.awarded_score, 0)

		const points = section.exam_section_questions.map(
			(esq) => esq.question.points ?? 0,
		)
		const sectionMax = sectionExpectedMax(section, points)

		totalAwarded += sectionAwarded
		totalMax += sectionMax

		// Anomaly: persisted section.total_marks doesn't match the
		// choice-aware ceiling. Typical cause: the bundle extractor set
		// choice_kind=all but the printed total implies any_n_of (e.g.
		// Pearson English Lang P1 Sec B printed "40 marks" with two
		// 40-mark alternatives — choice=all yields total_marks=80 from
		// the linker default).
		if (section.total_marks !== sectionMax) {
			logger.warn(TAG, "Section total drift — possible missed any_n_of", {
				jobId,
				section_id: section.id,
				section_title: section.title,
				persisted_total: section.total_marks,
				choice_aware_max: sectionMax,
				choice_kind: section.choice_kind,
				choice_n: section.choice_n,
				question_count: section.exam_section_questions.length,
			})
		}
	})

	if (orphans.length > 0) {
		const orphansAwarded = orphans.reduce((s, r) => s + r.awarded_score, 0)
		const orphansMax = orphans.reduce((s, r) => s + r.max_score, 0)
		logger.warn(TAG, "Grading results not linked to any section", {
			jobId,
			orphan_count: orphans.length,
			orphans_awarded: orphansAwarded,
			orphans_max: orphansMax,
			sample_question_ids: orphans.slice(0, 5).map((r) => r.question_id),
		})
		totalAwarded += orphansAwarded
		totalMax += orphansMax
	}

	return { totalAwarded, totalMax }
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

async function notifyBatchIfComplete(
	processingBatchId: string | null,
): Promise<void> {
	if (!processingBatchId) return
	await checkAndNotifyBatchCompletion(processingBatchId)
}

// ─── Batch completion check ───────────────────────────────────────────────────

/**
 * Atomically checks whether every submission in a ProcessingBatch has reached
 * a terminal state (grading complete/failed/cancelled, or OCR failed — once
 * OCR fails, grading never starts so the OCR failure IS the terminal). If so,
 * marks the batch complete and emits the batch.completed event. Uses an
 * UPDATE...WHERE pattern so only one Lambda invocation can win the race;
 * safe to call multiple times — idempotent once notification_sent_at is set.
 *
 * Called from:
 *  - the grading processor on success
 *  - the OCR-DLQ handler after a permanently-failed OCR
 *  - the grading-DLQ handler after a permanently-failed grade
 *
 * Without the DLQ wiring, a batch with one permanently-failing job never
 * reached terminalCount === total and silently dropped the email.
 */
export async function checkAndNotifyBatchCompletion(
	processingBatchId: string,
): Promise<void> {
	const batch = await db.processingBatch.findUnique({
		where: { id: processingBatchId },
		select: {
			id: true,
			kind: true,
			total_jobs: true,
			notification_sent_at: true,
			triggered_by: true,
		},
	})

	if (!batch || batch.notification_sent_at || batch.total_jobs === 0) {
		return
	}

	const terminalCount = await db.studentSubmission.count({
		where: {
			processing_batch_id: processingBatchId,
			OR: [
				{
					grading_runs: {
						some: { status: { in: ["complete", "failed", "cancelled"] } },
					},
				},
				{ ocr_runs: { some: { status: "failed" } } },
			],
		},
	})

	if (terminalCount < batch.total_jobs) return

	const failedCount = await db.studentSubmission.count({
		where: {
			processing_batch_id: processingBatchId,
			OR: [
				{
					grading_runs: {
						some: { status: { in: ["failed", "cancelled"] } },
					},
				},
				{ ocr_runs: { some: { status: "failed" } } },
			],
		},
	})
	const successCount = batch.total_jobs - failedCount
	const overallStatus = failedCount === batch.total_jobs ? "failed" : "complete"

	const now = new Date()
	const updated = await db.processingBatch.updateMany({
		where: { id: processingBatchId, notification_sent_at: null },
		data: {
			status: overallStatus,
			notification_sent_at: now,
			completed_at: now,
		},
	})

	if (updated.count === 0) return

	logger.info(TAG, "Batch complete — emitting batch.completed event", {
		processingBatchId,
		kind: batch.kind,
		totalJobs: batch.total_jobs,
		successCount,
		failedCount,
	})

	// Email + push are both subscribers of `deepmark.marking → batch.completed`
	// on the EventBus; this single emit fans out to both. Failures land in
	// each subscriber's own DLQ — never block the grader on a notification
	// blip.
	await emitEvent({
		source: EventSource.marking,
		detailType: EventDetailType.batchCompleted,
		detail: {
			processingBatchId,
			kind: batch.kind,
			triggeredBy: batch.triggered_by,
			totalSubmissions: batch.total_jobs,
			successCount,
			failedCount,
		},
	})
}

import { logger } from "@/lib/infra/logger"
import { type PageToken, alignTokensToAnswer } from "@mcp-gcse/shared"
import type { EditorView } from "@tiptap/pm/view"
import {
	type AnnotationMarkSpec,
	type McqRow,
	type OcrTokenSpec,
	applyOcrTokenMarks,
	insertMcqTableBlock,
	insertQuestionBlock,
	setAnswerText,
} from "./editor-ops"
import { HeadlessEditor } from "./headless-editor"

const TAG = "collab-editor-seed"

// ─── Public types ────────────────────────────────────────────────────────────

export type QuestionSkeleton = {
	questionId: string
	questionNumber: string
	questionText: string | null
	maxScore: number | null
	/**
	 * "multiple_choice" produces an `mcqAnswer` atom block (radio grid
	 * NodeView in the web app); anything else (default) produces a
	 * `questionAnswer` block with editable inline text.
	 */
	questionType?: string
	/** Required for MCQ blocks. Each option's display label + text. */
	options?: Array<{ option_label: string; option_text: string }>
	/** Required for MCQ blocks. The mark scheme's correct option labels. */
	correctLabels?: string[]
}

export type PerQuestionAnswer = {
	questionId: string
	text: string
	tokens: PageToken[]
}

// ─── High-level seeding helpers (called from OCR Lambda) ─────────────────────

/**
 * Dispatch the *complete* OCR result for a submission in a single editor
 * transact. Inserts every question block, sets answer text where present,
 * and overlays `ocrToken` marks computed via the same `alignTokensToAnswer`
 * the web client uses.
 *
 * This is the only editor write the OCR Lambda makes. ySyncPlugin coalesces
 * every PM dispatch in the closure into a single Yjs update on the wire,
 * so the teacher's editor populates atomically when the OCR Lambda finishes
 * — no skeleton-then-fill flicker, no race window where a concurrent
 * invocation could double up the question blocks.
 *
 * Callers must pass `perQuestion` keyed against the same `questionId` set
 * as `questions` (extra entries are ignored, missing entries leave the
 * block empty).
 */
export function dispatchExtractedDoc(
	editor: HeadlessEditor,
	questions: QuestionSkeleton[],
	perQuestion: PerQuestionAnswer[],
): void {
	if (questions.length === 0) return
	editor.transact((view) =>
		dispatchExtractedDocOps(view, questions, perQuestion),
	)
}

/**
 * Pure PM-side projection of `dispatchExtractedDoc`. Exported for unit
 * tests that drive a headless EditorView without standing up Hocuspocus.
 * Call sites in production should use `dispatchExtractedDoc` so the ops
 * are wrapped in an `editor.transact` (which carries the "ai" origin
 * label and lets the projection Lambda filter).
 */
export function dispatchExtractedDocOps(
	view: EditorView,
	questions: QuestionSkeleton[],
	perQuestion: PerQuestionAnswer[],
): void {
	if (questions.length === 0) return

	const answersByQuestionId = new Map<string, PerQuestionAnswer>()
	for (const a of perQuestion) answersByQuestionId.set(a.questionId, a)

	// Collect MCQ rows first and insert the `mcqTable` BEFORE any
	// questionAnswer blocks. The table renders as a single compact grid at
	// the top of the answer sheet, matching the layout the legacy
	// `build-doc.ts` produced (and matching the natural question order on
	// most papers, where MCQs sit at the start). The student's chosen
	// letter for each MCQ is whatever the OCR/MCQ-resolution pipeline put
	// in `answer.text` (e.g. "C"); blank if no answer detected.
	const mcqRows: McqRow[] = []
	for (const q of questions) {
		if (q.questionType !== "multiple_choice") continue
		const answer = answersByQuestionId.get(q.questionId)
		mcqRows.push({
			questionId: q.questionId,
			questionNumber: q.questionNumber,
			questionText: q.questionText,
			maxScore: q.maxScore ?? 0,
			options: q.options ?? [],
			correctLabels: q.correctLabels ?? [],
			studentAnswer: answer?.text?.trim() || null,
			awardedScore: null,
			markingMethod: null,
			feedbackSummary: null,
			llmReasoning: null,
			whatWentWell: [],
			evenBetterIf: [],
			markPointsResults: [],
			levelAwarded: null,
			whyNotNextLevel: null,
			capApplied: null,
			markSchemeId: null,
			teacherOverride: null,
			teacherFeedbackOverride: null,
		})
	}
	if (mcqRows.length > 0) insertMcqTableBlock(view, mcqRows)

	for (const q of questions) {
		if (q.questionType === "multiple_choice") continue

		insertQuestionBlock(view, {
			questionId: q.questionId,
			questionNumber: q.questionNumber,
			questionText: q.questionText,
			maxScore: q.maxScore,
		})

		const answer = answersByQuestionId.get(q.questionId)
		if (!answer || answer.text.length === 0) continue

		setAnswerText(view, q.questionId, answer.text)

		if (answer.tokens.length === 0) continue
		const alignment = alignTokensToAnswer(answer.text, answer.tokens)
		const tokenSpecs: OcrTokenSpec[] = []
		for (const t of answer.tokens) {
			const offset = alignment.tokenMap[t.id]
			if (!offset) continue
			tokenSpecs.push({
				id: t.id,
				bbox: t.bbox,
				pageOrder: t.page_order,
				charStart: offset.start,
				charEnd: offset.end,
			})
		}
		if (tokenSpecs.length > 0) {
			applyOcrTokenMarks(view, q.questionId, tokenSpecs)
		}
	}
}

// ─── Annotation spec (used by grade Lambda's per-question dispatcher) ────────

export type AnnotationSpec = {
	questionId: string
	mark: AnnotationMarkSpec
}

// ─── Editor session wrapper ──────────────────────────────────────────────────

/**
 * Run the supplied operations against a fresh HeadlessEditor for the given
 * submission. The editor is opened, the callback runs, the in-flight Yjs
 * updates are flushed to Hocuspocus, and the editor is closed.
 *
 * Errors propagate. The document is the source of truth for everything in
 * the editor, so a failed editor session must be a real failure — the
 * caller's SQS handler turns the error into `batchItemFailures` and the
 * message is retried. No silent swallows. See
 * `docs/build-plan-doc-as-source-of-truth.md` (Step 2).
 */
export async function withHeadlessEditor<T>(
	submissionId: string,
	op: string,
	fn: (editor: HeadlessEditor) => T | Promise<T>,
): Promise<T> {
	let editor: HeadlessEditor | null = null
	const tStart = performance.now()
	let workMs = 0
	let flushMs = 0
	let closeMs = 0
	try {
		editor = await HeadlessEditor.open({ submissionId })
		const tWork0 = performance.now()
		const result = await fn(editor)
		workMs = performance.now() - tWork0
		const tFlush0 = performance.now()
		await editor.flush()
		flushMs = performance.now() - tFlush0
		return result
	} catch (err) {
		logger.error(TAG, "Headless editor session failed", {
			submissionId,
			op,
			error: err instanceof Error ? err.message : String(err),
		})
		throw err
	} finally {
		const tClose0 = performance.now()
		try {
			editor?.close()
		} catch (err) {
			// Close is local-only teardown (WS shutdown, view destroy). A
			// failure here doesn't affect the dispatched ops — they were
			// already flushed above. Log and move on.
			logger.warn(TAG, "Headless editor close failed", {
				submissionId,
				op,
				error: err instanceof Error ? err.message : String(err),
			})
		}
		closeMs = performance.now() - tClose0

		// One consolidated timing log per session. Compare `ms_work` against
		// the open-phase costs to decide whether the editor-bring-up overhead
		// is worth optimising — see "HeadlessEditor per Lambda invocation"
		// thread for the proposed direct-Yjs-write fix and its tradeoffs.
		const t = editor?.openTimings
		logger.info(TAG, "Headless editor session timings", {
			submissionId,
			op,
			ms_total: Math.round(performance.now() - tStart),
			ms_open_dom: t ? Math.round(t.ensureDomMs) : null,
			ms_open_sync: t ? Math.round(t.syncProviderMs) : null,
			ms_open_view: t ? Math.round(t.createViewMs) : null,
			ms_work: Math.round(workMs),
			ms_flush: Math.round(flushMs),
			ms_close: Math.round(closeMs),
		})
	}
}

import type { Node as PmNode } from "@tiptap/pm/model"
import type { EditorView } from "@tiptap/pm/view"
import type { AnnotationSignal } from "./alignment/types"
import { SIGNAL_TO_TIPTAP } from "./mark-registry"
import {
	type McqRow,
	type QuestionGradeAttrs,
	type TeacherOverrideAttrs,
	mcqTableAttrsSchema,
} from "./node-attrs"

export type {
	McqRow,
	QuestionGradeAttrs,
	TeacherOverrideAttrs,
} from "./node-attrs"

/**
 * Incremental edits on a submission's collaborative document, expressed as
 * real ProseMirror transactions on a headless EditorView (see
 * `headless-editor.ts`). The view's ySyncPlugin observes each dispatch and
 * writes the equivalent Yjs ops to the bound XmlFragment, which Hocuspocus
 * relays to every connected client.
 *
 * Callers should batch related ops inside a single
 * `editor.transact((view) => ...)` call so the resulting Yjs ops collapse
 * into one wire packet — except where progressive UX matters (e.g. one
 * transact per question's annotations, so the teacher's editor "fills in"
 * one block at a time).
 */

export type OcrTokenSpec = {
	id: string
	bbox: [number, number, number, number]
	pageOrder: number
	/** Character offset (start) in the answer text where this token aligns. */
	charStart: number
	/** Character offset (end, exclusive) in the answer text where this token aligns. */
	charEnd: number
}

export type AnnotationMarkSpec = {
	/** Domain signal: "tick", "cross", "underline", "double_underline", "box", "circle", "chain". */
	signal: AnnotationSignal
	sentiment: "positive" | "negative" | "neutral"
	/** Character range within the question's answer text. */
	from: number
	to: number
	/**
	 * Tiptap mark attrs to attach (annotationId, reason, ao_category, comment,
	 * scan*, chainType, phrase, etc.). Sentiment is set separately and merged.
	 */
	attrs: Record<string, unknown>
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Insert a `questionAnswer` block keyed by `questionId`. Idempotent: if a
 * block with the same `questionId` already exists, this is a no-op.
 *
 * If the doc is just the placeholder paragraph that ySyncPlugin auto-fills
 * an empty fragment with (one empty `paragraph` because the schema's top
 * content requires `+`), the new block REPLACES that paragraph rather
 * than appending after it. Otherwise the block is appended to the end of
 * the document with empty inline content (use `setAnswerText` to populate).
 */
export function insertQuestionBlock(
	view: EditorView,
	params: {
		questionId: string
		questionNumber: string
		questionText?: string | null
		maxScore?: number | null
	},
): void {
	const { state, dispatch } = view
	if (findQuestionBlock(state.doc, params.questionId)) return

	const node = state.schema.nodes.questionAnswer.create(
		{
			questionId: params.questionId,
			questionNumber: params.questionNumber,
			questionText: params.questionText ?? null,
			maxScore: params.maxScore ?? null,
			awardedScore: null,
		},
		[],
	)

	// First-insert case: replace the auto-fill paragraph so it doesn't
	// linger as a leading blank in the document.
	if (state.doc.childCount === 1) {
		const onlyChild = state.doc.firstChild
		if (
			onlyChild &&
			onlyChild.type.name === "paragraph" &&
			onlyChild.content.size === 0
		) {
			dispatch(state.tr.replaceWith(0, state.doc.content.size, node))
			return
		}
	}

	dispatch(state.tr.insert(state.doc.content.size, node))
}

/**
 * Parse the `results` attr off an mcqTable node. Validates structure at the
 * doc/code boundary so the rest of editor-ops can spread/merge rows without
 * `as` casts. A malformed table throws — surfaces a doc corruption loudly
 * rather than silently writing back a half-typed row.
 */
function readMcqResults(tableAttrs: Record<string, unknown>): McqRow[] {
	return mcqTableAttrsSchema.parse(tableAttrs).results
}

/**
 * Insert the AI examiner summary as a leading `paragraph` block. Idempotent
 * via two guards:
 *
 *   1. If a leading paragraph already exists *with content* — assume the
 *      teacher (or a previous run) already populated it and leave it alone.
 *   2. If a leading paragraph exists but is empty — replace it.
 *
 * Otherwise inserts a new paragraph at position 0. Called from the grading
 * Lambda once `generateExaminerSummary` has produced the text.
 */
export function insertExaminerSummary(view: EditorView, summary: string): void {
	const trimmed = summary.trim()
	if (trimmed.length === 0) return

	const { state, dispatch } = view
	const paragraphType = state.schema.nodes.paragraph
	if (!paragraphType) return

	const node = paragraphType.create(null, state.schema.text(trimmed))

	const first = state.doc.firstChild
	if (first?.type.name === "paragraph") {
		if (first.textContent.trim().length > 0) return
		dispatch(state.tr.replaceWith(0, first.nodeSize, node))
		return
	}

	dispatch(state.tr.insert(0, node))
}

/**
 * Insert one `mcqTable` atom block carrying every MCQ on the paper. The
 * table's `results` attr is an array of `McqRow` entries — `McqTableView`
 * (in the web app) renders it as a compact grid of options + ticks. There
 * should be at most one `mcqTable` per doc; this op is a no-op if one
 * already exists.
 */
export function insertMcqTableBlock(view: EditorView, rows: McqRow[]): void {
	const { state, dispatch } = view
	if (rows.length === 0) return
	if (findMcqTable(state.doc)) return

	const node = state.schema.nodes.mcqTable.create({ results: rows })

	if (state.doc.childCount === 1) {
		const onlyChild = state.doc.firstChild
		if (
			onlyChild &&
			onlyChild.type.name === "paragraph" &&
			onlyChild.content.size === 0
		) {
			dispatch(state.tr.replaceWith(0, state.doc.content.size, node))
			return
		}
	}

	dispatch(state.tr.insert(state.doc.content.size, node))
}

/**
 * Write the full set of AI-grade metadata for a question to the doc in
 * one transaction. Two paths:
 *
 * 1. Question is in a `questionAnswer` block → setNodeMarkup with new attrs.
 * 2. Question is a row inside the doc's `mcqTable` block → setNodeMarkup on
 *    the table with an updated `results` array (the matching row's grade
 *    fields are replaced; other rows are untouched).
 *
 * Called by the grade Lambda once each question has been marked. The doc
 * is the source of truth for the grade — renderers read it directly,
 * the projection Lambda mirrors it to `GradingRun.grading_results` JSON
 * for non-realtime consumers (analytics, exports). No parallel PG row
 * carries the grade fields.
 *
 * Teacher overrides are NOT touched by this op — they live on
 * `teacherOverride` / `teacherFeedbackOverride` attrs and are written via
 * `setTeacherOverride`. No-op if the questionId matches no block or row.
 */
export function setQuestionGrade(
	view: EditorView,
	questionId: string,
	grade: QuestionGradeAttrs,
): void {
	const { state, dispatch } = view

	const block = findQuestionBlock(state.doc, questionId)
	if (block) {
		const nodePos = block.start - 1
		dispatch(
			state.tr.setNodeMarkup(nodePos, undefined, {
				...block.node.attrs,
				...grade,
			}),
		)
		return
	}

	const table = findMcqTable(state.doc)
	if (!table) return
	const results = readMcqResults(table.node.attrs)
	const idx = results.findIndex((r) => r.questionId === questionId)
	if (idx === -1) return
	const updated = [...results]
	updated[idx] = { ...updated[idx], ...grade }
	const tablePos = table.start - 1
	dispatch(
		state.tr.setNodeMarkup(tablePos, undefined, {
			...table.node.attrs,
			results: updated,
		}),
	)
}

/**
 * Write a teacher score / feedback override to the doc. Lives on the same
 * block as the AI grade attrs. Pass `override = null` to clear.
 *
 * Called from the web tier (server action → HeadlessEditor session, or
 * directly via Hocuspocus from the browser) when a teacher adjusts a mark
 * or replaces feedback text. The projection Lambda picks up the change
 * on the next snapshot and writes a `TeacherOverride` row for analytics
 * consumers; UI reads from the doc directly via the NodeView.
 */
export function setTeacherOverride(
	view: EditorView,
	questionId: string,
	override: TeacherOverrideAttrs | null,
	feedbackOverride: string | null = null,
): void {
	const { state, dispatch } = view

	const block = findQuestionBlock(state.doc, questionId)
	if (block) {
		const nodePos = block.start - 1
		dispatch(
			state.tr.setNodeMarkup(nodePos, undefined, {
				...block.node.attrs,
				teacherOverride: override,
				teacherFeedbackOverride: feedbackOverride,
			}),
		)
		return
	}

	const table = findMcqTable(state.doc)
	if (!table) return
	const results = readMcqResults(table.node.attrs)
	const idx = results.findIndex((r) => r.questionId === questionId)
	if (idx === -1) return
	const updated = [...results]
	updated[idx] = {
		...updated[idx],
		teacherOverride: override,
		teacherFeedbackOverride: feedbackOverride,
	}
	const tablePos = table.start - 1
	dispatch(
		state.tr.setNodeMarkup(tablePos, undefined, {
			...table.node.attrs,
			results: updated,
		}),
	)
}

/**
 * Update the `whatWentWell` and/or `evenBetterIf` bullet lists on a
 * graded question. Teacher-driven edits flow through here from the
 * web tier: the QuestionAnswerView shows a textarea (one bullet per
 * line); on blur the list is parsed and dispatched. AI grades arrive
 * via `setQuestionGrade` which writes both fields atomically — once
 * the teacher edits, their value persists since `setQuestionGrade` is
 * only called from re-grades (which always create a new submission).
 *
 * No-op if `questionId` matches no block / row, or if neither field
 * is present in the patch.
 */
export function setQuestionFeedbackBullets(
	view: EditorView,
	questionId: string,
	patch: { whatWentWell?: string[]; evenBetterIf?: string[] },
): void {
	if (patch.whatWentWell === undefined && patch.evenBetterIf === undefined)
		return

	const { state, dispatch } = view

	const block = findQuestionBlock(state.doc, questionId)
	if (block) {
		const nodePos = block.start - 1
		dispatch(
			state.tr.setNodeMarkup(nodePos, undefined, {
				...block.node.attrs,
				...(patch.whatWentWell !== undefined && {
					whatWentWell: patch.whatWentWell,
				}),
				...(patch.evenBetterIf !== undefined && {
					evenBetterIf: patch.evenBetterIf,
				}),
			}),
		)
		return
	}

	const table = findMcqTable(state.doc)
	if (!table) return
	const results = readMcqResults(table.node.attrs)
	const idx = results.findIndex((r) => r.questionId === questionId)
	if (idx === -1) return
	const updated = [...results]
	updated[idx] = {
		...updated[idx],
		...(patch.whatWentWell !== undefined && {
			whatWentWell: patch.whatWentWell,
		}),
		...(patch.evenBetterIf !== undefined && {
			evenBetterIf: patch.evenBetterIf,
		}),
	}
	const tablePos = table.start - 1
	dispatch(
		state.tr.setNodeMarkup(tablePos, undefined, {
			...table.node.attrs,
			results: updated,
		}),
	)
}

/**
 * Convenience wrapper around `setQuestionGrade` that only updates
 * `awardedScore` (other grade attrs are read from the existing block /
 * row state and re-applied unchanged). Used by older call sites + tests
 * that only carry the awarded number, not the full grade payload.
 */
export function setQuestionScore(
	view: EditorView,
	questionId: string,
	awardedScore: number,
): void {
	const { state, dispatch } = view

	const block = findQuestionBlock(state.doc, questionId)
	if (block) {
		const nodePos = block.start - 1
		dispatch(
			state.tr.setNodeMarkup(nodePos, undefined, {
				...block.node.attrs,
				awardedScore,
			}),
		)
		return
	}

	const table = findMcqTable(state.doc)
	if (!table) return
	const results = readMcqResults(table.node.attrs)
	const idx = results.findIndex((r) => r.questionId === questionId)
	if (idx === -1) return
	const updated = [...results]
	updated[idx] = { ...updated[idx], awardedScore }
	const tablePos = table.start - 1
	dispatch(
		state.tr.setNodeMarkup(tablePos, undefined, {
			...table.node.attrs,
			results: updated,
		}),
	)
}

/**
 * Set the inner text of a question's answer to `text`, **only if the
 * block has no inline content yet**. No-op if the named block does not
 * exist or if the block already contains any text — that latter guard
 * makes this op safe to dispatch from both the original-grade and
 * re-grade flows without clobbering teacher edits to the OCR-stitched
 * `answer_text` (the inline content of the `questionAnswer` block is
 * editable in the teacher's UI; their corrections live only in the
 * Y.Doc).
 *
 * Called from the OCR projection in the grade Lambda. Existing
 * annotation marks and ocrToken marks would be dropped by this
 * `replaceWith`, so callers should always invoke `applyOcrTokenMarks`
 * and `applyAnnotationMark` after setting text — but in practice the
 * skip-if-filled guard means this only runs once per block over the
 * lifetime of a Y.Doc, when the doc is freshly created.
 */
export function setAnswerText(
	view: EditorView,
	questionId: string,
	text: string,
): void {
	const { state, dispatch } = view
	const block = findQuestionBlock(state.doc, questionId)
	if (!block) return
	if (block.node.textContent.length > 0) return

	const blockEnd = block.start + block.node.content.size
	const replacement = text.length > 0 ? state.schema.text(text) : []
	dispatch(state.tr.replaceWith(block.start, blockEnd, replacement))
}

/**
 * Overlay `ocrToken` marks on the existing text of a question's answer,
 * one per word range. Ranges that fall outside the current text are
 * silently dropped. All ranges are added in one transaction.
 *
 * No-op if the question block doesn't exist or has no text yet.
 */
export function applyOcrTokenMarks(
	view: EditorView,
	questionId: string,
	tokens: OcrTokenSpec[],
): void {
	const { state, dispatch } = view
	const block = findQuestionBlock(state.doc, questionId)
	if (!block) return

	const text = block.node.textContent
	if (text.length === 0) return

	const markType = state.schema.marks.ocrToken
	if (!markType) return

	const tr = state.tr
	let anyAdded = false
	for (const token of tokens) {
		if (
			token.charStart < 0 ||
			token.charEnd > text.length ||
			token.charStart >= token.charEnd
		)
			continue
		tr.addMark(
			block.start + token.charStart,
			block.start + token.charEnd,
			markType.create({
				tokenId: token.id,
				bbox: token.bbox,
				pageOrder: token.pageOrder,
			}),
		)
		anyAdded = true
	}
	if (anyAdded) dispatch(tr)
}

/**
 * Apply a single annotation mark over a character range within a question's
 * answer text. Existing annotation marks and ocrToken marks on the block
 * are preserved by ProseMirror's natural mark composition — `tr.addMark`
 * adds the new mark alongside whatever's already on those characters.
 *
 * No-op if the question block doesn't exist, has no text, or the range
 * falls outside the text.
 */
export function applyAnnotationMark(
	view: EditorView,
	questionId: string,
	mark: AnnotationMarkSpec,
	source: "ai" | "teacher" = "ai",
): void {
	const { state, dispatch } = view
	const block = findQuestionBlock(state.doc, questionId)
	if (!block) return

	const text = block.node.textContent
	if (text.length === 0) return
	if (mark.from < 0 || mark.to > text.length || mark.from >= mark.to) return

	const tiptapName = SIGNAL_TO_TIPTAP[mark.signal]
	if (!tiptapName) return
	const markType = state.schema.marks[tiptapName]
	if (!markType) return

	dispatch(
		state.tr.addMark(
			block.start + mark.from,
			block.start + mark.to,
			// Source defaults to "ai" so existing Lambda call sites are unchanged
			// (the migration script passes "teacher" for teacher-authored rows).
			// Set after spreading mark.attrs so callers cannot override it via the
			// attrs bag.
			markType.create({
				...mark.attrs,
				sentiment: mark.sentiment,
				source,
			}),
		),
	)
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Locate the doc's `mcqTable` block, if any. There should be at most one
 * (every MCQ question on the paper is a row in this single table).
 */
function findMcqTable(doc: PmNode): { node: PmNode; start: number } | null {
	let result: { node: PmNode; start: number } | null = null
	doc.descendants((node, pos) => {
		if (result) return false
		if (node.type.name === "mcqTable") {
			result = { node, start: pos + 1 }
			return false
		}
	})
	return result
}

/**
 * Locate a `questionAnswer` block by `questionId`. Returns the matched
 * node and the PM position immediately INSIDE its open token (i.e. the
 * start of its inline content). Char offset `c` within the answer text
 * maps to PM position `start + c`.
 *
 * MCQs aren't `questionAnswer` blocks — they live as rows inside a single
 * `mcqTable` atom. Use `findMcqTable` for those.
 */
function findQuestionBlock(
	doc: PmNode,
	questionId: string,
): { node: PmNode; start: number } | null {
	let result: { node: PmNode; start: number } | null = null
	doc.descendants((node, pos) => {
		if (result) return false
		if (
			node.type.name === "questionAnswer" &&
			node.attrs.questionId === questionId
		) {
			result = { node, start: pos + 1 }
			return false
		}
	})
	return result
}

/**
 * Helpers used by the Talk to DeepMark tool dispatcher to apply, update,
 * and remove annotation marks on the live PM editor.
 *
 * Two addressing paths supported for adds:
 *   - **phrase** (primary): exact verbatim quote within the question's
 *     `student_answer`. Single match required; multi-match fails the call.
 *   - **token range** (selection fallback): tokenStart / tokenEnd resolved
 *     via the per-question alignment.
 *
 * Updates and removes address by `annotationId`. All ops dispatch a single
 * PM transaction so they go through Yjs as one update. The sidebar's
 * `onMarkApplied` is intentionally NOT fired here — DeepMark-applied marks
 * stay silent so a multi-mark batch doesn't flicker the active-card
 * activation.
 */

import type { TokenAlignment } from "@mcp-gcse/shared"
import type { Editor } from "@tiptap/core"
import type { Mark, Node as PmNode } from "@tiptap/pm/model"

import { signalToMarkName } from "@/lib/talk/tools"
import type {
	AddAnnotationInput,
	UpdateAnnotationInput,
} from "@/lib/talk/tools"

/** Sentiment derived from the API-facing signal. Mirrors MARK_ACTIONS. */
function sentimentForSignal(signal: AddAnnotationInput["signal"]): string {
	switch (signal) {
		case "cross":
		case "circle":
			return "negative"
		default:
			return "positive"
	}
}

export type ApplyAnnotationResult =
	| { ok: true; annotationId: string }
	| { ok: false; reason: string }

export type UpdateAnnotationResult =
	| { ok: true }
	| { ok: false; reason: string }

export type RemoveAnnotationResult = UpdateAnnotationResult

/**
 * Find the `questionAnswer` block in the doc with a matching `questionId`
 * attr. Returns the node plus its inner content positions, or null when no
 * block matches.
 */
export function findQuestionBlock(
	doc: PmNode,
	questionId: string,
): { node: PmNode; blockStart: number; blockEnd: number } | null {
	let found: {
		node: PmNode
		blockStart: number
		blockEnd: number
	} | null = null
	doc.descendants((node, pos) => {
		if (found) return false
		if (node.type.name !== "questionAnswer") return undefined
		if (node.attrs.questionId === questionId) {
			found = {
				node,
				blockStart: pos + 1,
				blockEnd: pos + node.nodeSize - 1,
			}
			return false
		}
		return undefined
	})
	return found
}

/**
 * Inverse of `pmPosToCharInBlock` — char offset within a question block's
 * `textContent` → PM position. Walks the block's children once, counting
 * text-node lengths and consuming non-text inline nodes (HardBreak) at 0
 * chars to match `textContent` semantics.
 *
 * Returns null when `char` exceeds the block's textContent length (caller
 * typically rejects with a "phrase past end of answer" reason).
 */
export function charToPmPosInBlock(
	block: PmNode,
	blockStart: number,
	char: number,
): number | null {
	if (char < 0) return null
	let pmCursor = blockStart
	let charCursor = 0
	for (let i = 0; i < block.childCount; i++) {
		const child = block.child(i)
		if (child.isText) {
			const len = child.text?.length ?? 0
			if (char <= charCursor + len) {
				return pmCursor + (char - charCursor)
			}
			pmCursor += child.nodeSize
			charCursor += len
		} else {
			// 0-char inline node (HardBreak / atom). Skip without advancing
			// `charCursor` — matches the existing `pmPosToCharInBlock` model
			// where these contribute 0 chars to `textContent`.
			pmCursor += child.nodeSize
		}
	}
	// `char` reached the trailing edge of the block.
	if (char === charCursor) return pmCursor
	return null
}

/**
 * Find an existing annotation mark by `annotationId` across the whole doc.
 * Returns the spanning PM range and the original Mark instance, or null if
 * no text node carries a mark with this id.
 *
 * A single annotation can span multiple adjacent text nodes (whenever
 * another mark — bold, italic — breaks the run); the returned range covers
 * from the FIRST text node's start to the LAST text node's end so we can
 * remove/replace the mark in one transaction.
 */
export function findAnnotationRange(
	doc: PmNode,
	annotationId: string,
): { from: number; to: number; mark: Mark } | null {
	let from = -1
	let to = -1
	let foundMark: Mark | null = null
	doc.descendants((node, pos) => {
		if (!node.isText) return undefined
		for (const m of node.marks) {
			if (m.attrs.annotationId === annotationId) {
				if (from === -1) from = pos
				to = pos + node.nodeSize
				foundMark = m
			}
		}
		return undefined
	})
	if (from === -1 || foundMark === null) return null
	return { from, to, mark: foundMark }
}

/** Build the attrs object for a new annotation mark from tool input. */
function attrsForNewMark(input: AddAnnotationInput): Record<string, unknown> {
	const annotationId = crypto.randomUUID()
	return {
		annotationId,
		// DeepMark-applied marks are tagged "teacher" — DeepMark is the
		// teacher's hand, conversationally. This matches what
		// `applyAnnotationMark` (the toolbar / shortcut path) does so the
		// projection Lambda treats both the same.
		source: "teacher",
		sentiment: sentimentForSignal(input.signal),
		reason: input.reason,
		comment: input.comment ?? null,
		ao_category: input.ao_category ?? null,
		ao_display: input.ao_display ?? null,
		ao_quality: input.ao_quality ?? null,
	}
}

/**
 * Add an annotation mark to a specific PM range. Internal — the public
 * entry points (`applyAnnotationByPhrase`, `applyAnnotationByTokenRange`)
 * resolve their addressing to a range, then delegate here.
 *
 * Does NOT call `onMarkApplied`; the sidebar's active-card activation is
 * for human-driven marks only. Multi-mark batches stay silent.
 */
function applyAnnotationAtRange(
	editor: Editor,
	from: number,
	to: number,
	input: AddAnnotationInput,
): ApplyAnnotationResult {
	const markName = signalToMarkName(input.signal)
	const markType = editor.schema.marks[markName]
	if (!markType) {
		return { ok: false, reason: `Mark ${markName} not registered on editor.` }
	}
	const attrs = attrsForNewMark(input)
	const mark = markType.create(attrs)
	const tr = editor.state.tr.addMark(from, to, mark)
	editor.view.dispatch(tr)
	return { ok: true, annotationId: attrs.annotationId as string }
}

/**
 * Apply an annotation by exact phrase match within the question's
 * `student_answer`. Phrase must appear exactly ONCE in the answer — zero
 * or multiple matches both fail with a reason the model can act on (retry
 * with a longer/different quote).
 */
export function applyAnnotationByPhrase(
	editor: Editor,
	input: AddAnnotationInput & { phrase: string },
): ApplyAnnotationResult {
	const block = findQuestionBlock(editor.state.doc, input.questionId)
	if (!block) {
		return {
			ok: false,
			reason: `Question ${input.questionId} not found in the document.`,
		}
	}
	const text = block.node.textContent
	const phrase = input.phrase
	const firstIdx = text.indexOf(phrase)
	if (firstIdx === -1) {
		return {
			ok: false,
			reason: `Phrase "${truncate(phrase)}" was not found in the student's answer. Quote verbatim from the Student answer block in the preamble.`,
		}
	}
	const secondIdx = text.indexOf(phrase, firstIdx + 1)
	if (secondIdx !== -1) {
		return {
			ok: false,
			reason: `Phrase "${truncate(phrase)}" appears more than once in the answer; include surrounding context to disambiguate.`,
		}
	}
	const pmFrom = charToPmPosInBlock(block.node, block.blockStart, firstIdx)
	const pmTo = charToPmPosInBlock(
		block.node,
		block.blockStart,
		firstIdx + phrase.length,
	)
	if (pmFrom === null || pmTo === null) {
		return { ok: false, reason: "Failed to map phrase to document position." }
	}
	return applyAnnotationAtRange(editor, pmFrom, pmTo, input)
}

/**
 * Apply an annotation by token-id range (selection-driven path). Both
 * endpoints must be in the per-question alignment.
 */
export function applyAnnotationByTokenRange(
	editor: Editor,
	input: AddAnnotationInput & { tokenStart: string; tokenEnd: string },
	alignmentByQuestion: ReadonlyMap<string, TokenAlignment>,
): ApplyAnnotationResult {
	const block = findQuestionBlock(editor.state.doc, input.questionId)
	if (!block) {
		return {
			ok: false,
			reason: `Question ${input.questionId} not found.`,
		}
	}
	const alignment = alignmentByQuestion.get(input.questionId)
	if (!alignment) {
		return {
			ok: false,
			reason: `Alignment not loaded for question ${input.questionId}.`,
		}
	}
	const startRange = alignment.tokenMap[input.tokenStart]
	const endRange = alignment.tokenMap[input.tokenEnd]
	if (!startRange) {
		return {
			ok: false,
			reason: `Token ${input.tokenStart} not found in alignment.`,
		}
	}
	if (!endRange) {
		return {
			ok: false,
			reason: `Token ${input.tokenEnd} not found in alignment.`,
		}
	}
	const charFrom = Math.min(startRange.start, endRange.start)
	const charTo = Math.max(startRange.end, endRange.end)
	const pmFrom = charToPmPosInBlock(block.node, block.blockStart, charFrom)
	const pmTo = charToPmPosInBlock(block.node, block.blockStart, charTo)
	if (pmFrom === null || pmTo === null) {
		return {
			ok: false,
			reason: "Failed to map token range to document position.",
		}
	}
	return applyAnnotationAtRange(editor, pmFrom, pmTo, input)
}

/**
 * Update an existing annotation's payload by replacing the mark across its
 * range with a new mark carrying the patched attrs. Same annotationId,
 * same source, same range — only the visible payload fields change.
 *
 * Replace (removeMark + addMark) rather than `tr.setNodeAttribute` because
 * marks aren't nodes; PM has no in-place mark attr setter.
 */
export function updateAnnotationById(
	editor: Editor,
	input: UpdateAnnotationInput,
): UpdateAnnotationResult {
	const found = findAnnotationRange(editor.state.doc, input.annotationId)
	if (!found) {
		return {
			ok: false,
			reason: `Annotation ${input.annotationId} not found.`,
		}
	}

	const currentType = found.mark.type
	const currentAttrs = found.mark.attrs

	// If the signal changed, the mark TYPE changes too (each signal is its
	// own TipTap mark). Remove old type, add new.
	const newType = input.signal
		? editor.schema.marks[signalToMarkName(input.signal)]
		: currentType
	if (!newType) {
		return { ok: false, reason: "New mark type not registered on editor." }
	}

	const patchedAttrs: Record<string, unknown> = {
		...currentAttrs,
		...(input.reason !== undefined ? { reason: input.reason } : {}),
		...(input.comment !== undefined ? { comment: input.comment } : {}),
		...(input.ao_category !== undefined
			? { ao_category: input.ao_category }
			: {}),
		...(input.ao_display !== undefined ? { ao_display: input.ao_display } : {}),
		...(input.ao_quality !== undefined ? { ao_quality: input.ao_quality } : {}),
		...(input.signal !== undefined
			? { sentiment: sentimentForSignal(input.signal) }
			: {}),
	}

	const newMark = newType.create(patchedAttrs)
	let tr = editor.state.tr.removeMark(found.from, found.to, currentType)
	if (newType !== currentType) {
		// Belt-and-braces: if another instance of newType already covers part
		// of the range from a prior call, remove it too so the addMark below
		// doesn't merge with stale attrs.
		tr = tr.removeMark(found.from, found.to, newType)
	}
	tr = tr.addMark(found.from, found.to, newMark)
	editor.view.dispatch(tr)
	return { ok: true }
}

/**
 * Remove an annotation mark across its entire range.
 */
export function removeAnnotationById(
	editor: Editor,
	annotationId: string,
): RemoveAnnotationResult {
	const found = findAnnotationRange(editor.state.doc, annotationId)
	if (!found) {
		return { ok: false, reason: `Annotation ${annotationId} not found.` }
	}
	const tr = editor.state.tr.removeMark(found.from, found.to, found.mark.type)
	editor.view.dispatch(tr)
	return { ok: true }
}

function truncate(s: string, max = 60): string {
	return s.length > max ? `${s.slice(0, max)}…` : s
}

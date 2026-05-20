/**
 * Editor-mutating helpers used by the Talk to DeepMark tool dispatcher.
 * Each function takes a live TipTap Editor, builds a PM transaction, and
 * dispatches it — the changes flow through Yjs to the projection Lambda
 * and any peer clients.
 *
 * Annotations are addressed by **phrase** (exact verbatim quote within
 * the question's `student_answer`). Single match required; multi-match
 * fails the call so the model can retry with a longer, disambiguating
 * quote.
 *
 * Updates and removes address by `annotationId`. The sidebar's
 * `onMarkApplied` is intentionally NOT fired here — DeepMark-applied
 * marks stay silent so a multi-mark batch doesn't flicker the active-
 * card activation.
 *
 * Pure read/derivation helpers live in `talk-tool-pure.ts`.
 */

import { signalToMarkName } from "@/lib/talk/tools"
import type {
	AddAnnotationInput,
	UpdateAnnotationInput,
} from "@/lib/talk/tools"
import type { Editor } from "@tiptap/core"
import {
	type ApplyAnnotationResult,
	type RemoveAnnotationResult,
	type UpdateAnnotationResult,
	attrsForNewMark,
	buildBlockTextWithBreaks,
	charToPmPosInBlockWithBreaks,
	findAnnotationRange,
	findQuestionBlock,
	sentimentForSignal,
	truncate,
} from "./talk-tool-pure"

/**
 * Add an annotation mark to a specific PM range. Internal — the public
 * entry point (`applyAnnotationByPhrase`) resolves its phrase to a range
 * then delegates here.
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
	// Linearise the block text with explicit "\n" at HardBreaks so the
	// model can quote phrases that span line breaks. `node.textContent`
	// strips HardBreaks and silently glues line-end to line-start, which
	// previously forced the prompt to require single-line quotes.
	const text = buildBlockTextWithBreaks(block.node)
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
	const pmFrom = charToPmPosInBlockWithBreaks(
		block.node,
		block.blockStart,
		firstIdx,
	)
	const pmTo = charToPmPosInBlockWithBreaks(
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

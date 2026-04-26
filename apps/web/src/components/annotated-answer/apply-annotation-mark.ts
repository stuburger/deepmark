import type { Editor } from "@tiptap/core"
import type { Node as PmNode } from "@tiptap/pm/model"
import { TextSelection } from "@tiptap/pm/state"
import { MARK_ACTIONS } from "./mark-actions"

const ANNOTATION_MARK_NAMES = MARK_ACTIONS.map((a) => a.name)

/** True when [from, to) lies entirely inside one `questionAnswer` block. */
function rangeInsideQuestionAnswer(
	doc: PmNode,
	from: number,
	to: number,
): boolean {
	const $from = doc.resolve(from)
	let qaDepth = -1
	for (let d = $from.depth; d >= 0; d--) {
		if ($from.node(d).type.name === "questionAnswer") {
			qaDepth = d
			break
		}
	}
	if (qaDepth < 0) return false
	const qaStart = $from.start(qaDepth)
	const qaEnd = $from.end(qaDepth)
	return from >= qaStart && to <= qaEnd
}

/** Non-collapsed selection fully inside a `questionAnswer` block (toolbar / bubble menu). */
export function canApplyAnnotations(editor: Editor): boolean {
	const { from, to } = editor.state.selection
	if (from === to) return false
	return rangeInsideQuestionAnswer(editor.state.doc, from, to)
}

/** Returns true if any text node in [from, to) carries the named mark. */
function hasMarkInRange(
	doc: PmNode,
	from: number,
	to: number,
	markName: string,
): boolean {
	let found = false
	doc.nodesBetween(from, to, (node) => {
		if (found) return false
		if (node.isText && node.marks.some((m) => m.type.name === markName)) {
			found = true
		}
	})
	return found
}

/**
 * Snaps a character range to word boundaries within a questionAnswer node.
 * Walks backward from `from` and forward from `to` to find whitespace edges.
 */
function snapToWordBounds(
	doc: PmNode,
	from: number,
	to: number,
): { from: number; to: number } {
	const $from = doc.resolve(from)

	// Find the questionAnswer ancestor
	let qaStart = 0
	let qaText = ""
	for (let d = $from.depth; d >= 0; d--) {
		const ancestor = $from.node(d)
		if (ancestor.type.name === "questionAnswer") {
			qaStart = $from.start(d)
			qaText = ancestor.textContent
			break
		}
	}
	if (!qaText) return { from, to }

	const relFrom = from - qaStart
	const relTo = to - qaStart

	// Walk backward to word start
	let wordStart = relFrom
	while (wordStart > 0 && !/\s/.test(qaText[wordStart - 1])) wordStart--

	// Walk forward to word end
	let wordEnd = relTo
	while (wordEnd < qaText.length && !/\s/.test(qaText[wordEnd])) wordEnd++

	return { from: qaStart + wordStart, to: qaStart + wordEnd }
}

/**
 * Applies an annotation mark with word-snapping and a generated annotationId.
 *
 * 1. Extends the current selection to word boundaries
 * 2. Generates a unique annotationId for the mark
 * 3. Applies the mark via addMark
 *
 * Returns the generated annotationId so callers can activate the sidebar card.
 * Returns null if no selection exists or the selection is not entirely inside a
 * `questionAnswer` block (e.g. teacher `paragraph` notes).
 */
export function applyAnnotationMark(
	editor: Editor,
	markName: string,
	baseAttrs?: Record<string, unknown>,
): string | null {
	const { from: selFrom, to: selTo } = editor.state.selection
	if (selFrom === selTo) return null

	if (!rangeInsideQuestionAnswer(editor.state.doc, selFrom, selTo)) {
		return null
	}

	const markType = editor.schema.marks[markName]
	if (!markType) return null

	const { from, to } = snapToWordBounds(editor.state.doc, selFrom, selTo)

	// Check if this mark is already active on the range — if so, remove it (toggle)
	if (hasMarkInRange(editor.state.doc, from, to, markName)) {
		const tr = editor.state.tr.removeMark(from, to, markType)
		// Restore the selection so the bubble menu stays visible
		tr.setSelection(TextSelection.create(tr.doc, from, to))
		editor.view.dispatch(tr)
		return null
	}

	const annotationId = crypto.randomUUID()
	const mark = markType.create({
		...baseAttrs,
		annotationId,
		// Tag every teacher-applied mark so the projection Lambda writes the
		// row with source="teacher" rather than defaulting to "ai".
		source: "teacher",
	})

	const tr = editor.state.tr.addMark(from, to, mark)
	// Restore the selection so the bubble menu stays visible
	tr.setSelection(TextSelection.create(tr.doc, from, to))
	editor.view.dispatch(tr)
	return annotationId
}

/**
 * Returns true when the current selection overlaps at least one annotation mark.
 * Used to gate the "remove all" button.
 */
export function hasAnnotationMarkInSelection(editor: Editor): boolean {
	const { from, to } = editor.state.selection
	if (from === to) return false
	return ANNOTATION_MARK_NAMES.some((name) =>
		hasMarkInRange(editor.state.doc, from, to, name),
	)
}

/**
 * Removes every annotation mark from the word-snapped selection range and
 * restores the selection so the toolbar / bubble menu stays visible.
 */
export function removeAllAnnotationMarks(editor: Editor): void {
	const { from: selFrom, to: selTo } = editor.state.selection
	if (selFrom === selTo) return

	if (!rangeInsideQuestionAnswer(editor.state.doc, selFrom, selTo)) return

	const { from, to } = snapToWordBounds(editor.state.doc, selFrom, selTo)

	let tr = editor.state.tr
	for (const name of ANNOTATION_MARK_NAMES) {
		const markType = editor.schema.marks[name]
		if (markType) tr = tr.removeMark(from, to, markType)
	}
	tr.setSelection(TextSelection.create(tr.doc, from, to))
	editor.view.dispatch(tr)
}

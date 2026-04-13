import type { Editor } from "@tiptap/core"
import type { Node as PmNode } from "@tiptap/pm/model"
import { TextSelection } from "@tiptap/pm/state"

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
 * 3. Applies the mark via addMark (passes through ReadOnlyText)
 *
 * Returns the generated annotationId so callers can activate the sidebar card.
 * Returns null if no selection exists.
 */
export function applyAnnotationMark(
	editor: Editor,
	markName: string,
	baseAttrs?: Record<string, unknown>,
): string | null {
	const { from: selFrom, to: selTo } = editor.state.selection
	if (selFrom === selTo) return null

	const markType = editor.schema.marks[markName]
	if (!markType) return null

	const { from, to } = snapToWordBounds(editor.state.doc, selFrom, selTo)

	// Check if this mark is already active on the range — if so, remove it (toggle)
	const $from = editor.state.doc.resolve(from)
	const existingMark = $from.marks().find((m) => m.type.name === markName)
	if (existingMark) {
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
	})

	const tr = editor.state.tr.addMark(from, to, mark)
	// Restore the selection so the bubble menu stays visible
	tr.setSelection(TextSelection.create(tr.doc, from, to))
	editor.view.dispatch(tr)
	return annotationId
}

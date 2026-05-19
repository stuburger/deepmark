import {
	type TokenAlignment,
	tokenIdAtChar,
	tokenIdsInRange,
} from "@mcp-gcse/shared"
import type { Editor } from "@tiptap/core"
import type { Node as PmNode } from "@tiptap/pm/model"
import { useEffect } from "react"
import { pmPosToAnswerChar } from "./pm-pos-mapping"

/**
 * Map a PM range `[from, to)` to a set of tokenIds in the scan, via the
 * per-question runtime alignment. Returns null when:
 *  - the range doesn't fall inside a question block
 *  - no alignment is loaded for the question yet
 *  - no tokens overlap the answer-char range
 */
function resolveTokensForRange(
	doc: PmNode,
	from: number,
	to: number,
	alignmentByQuestion: ReadonlyMap<string, TokenAlignment>,
): string[] | null {
	// Walk every `questionAnswer` block that overlaps the selection. For
	// each, clip the selection to the block's PM range, convert clipped
	// endpoints to answer-char offsets, and look up tokenIds via that
	// question's alignment. Union the results across blocks — selections
	// can legitimately span multiple questions and the scan overlay
	// renders highlights per-page, not per-question.
	const ids: string[] = []
	const seen = new Set<string>()

	doc.descendants((node, pos) => {
		if (node.type.name !== "questionAnswer") return
		const questionId = node.attrs.questionId as string | null
		if (!questionId) return

		const blockStart = pos + 1
		const blockEnd = blockStart + node.content.size
		const overlapFrom = Math.max(from, blockStart)
		const overlapTo = Math.min(to, blockEnd)
		if (overlapTo <= overlapFrom) return false // no overlap; don't recurse

		const alignment = alignmentByQuestion.get(questionId)
		if (!alignment) return false

		const startPt = pmPosToAnswerChar(doc, overlapFrom)
		const endPt = pmPosToAnswerChar(doc, overlapTo)
		if (!startPt || !endPt) return false
		if (
			startPt.questionId !== questionId ||
			endPt.questionId !== questionId
		)
			return false

		const charTo = Math.max(endPt.char, startPt.char + 1)
		for (const id of tokenIdsInRange(startPt.char, charTo, alignment)) {
			if (!seen.has(id)) {
				seen.add(id)
				ids.push(id)
			}
		}
		// Don't descend further — child block nodes can't appear inside
		// `questionAnswer` (content: "inline*").
		return false
	})

	return ids.length > 0 ? ids : null
}

/**
 * Find every text fragment in the doc that carries `annotationId`,
 * compute the union char range inside its owning question block, and map
 * that range to tokenIds via the per-question alignment. Returns null
 * when no marks match or the alignment for the question isn't loaded.
 */
function resolveTokensForAnnotation(
	doc: PmNode,
	annotationId: string,
	alignmentByQuestion: ReadonlyMap<string, TokenAlignment>,
): string[] | null {
	let questionId: string | null = null
	let charFrom = Number.POSITIVE_INFINITY
	let charTo = Number.NEGATIVE_INFINITY

	doc.descendants((node, _pos) => {
		if (node.type.name !== "questionAnswer") return
		const qid = node.attrs.questionId as string | null
		if (!qid) return

		let childOffset = 0
		for (let i = 0; i < node.childCount; i++) {
			const child = node.child(i)
			const offsetForChild = childOffset
			childOffset += child.nodeSize
			if (!child.isText || !child.marks.length) continue
			const matches = child.marks.some(
				(m) => (m.attrs.annotationId as string | null) === annotationId,
			)
			// `continue` (not `return`) — we need to scan EVERY child in the
			// block to find the annotation's text. `return` here exits the
			// descendants callback and abandons subsequent children, which
			// silently breaks any annotation that doesn't start at the very
			// first text child of its question block.
			if (!matches) continue
			// Multiple question blocks holding marks with the same annotationId
			// would be a doc-corruption bug; pick the first match.
			questionId = qid
			const from = offsetForChild
			const to = offsetForChild + child.nodeSize
			if (from < charFrom) charFrom = from
			if (to > charTo) charTo = to
		}
	})

	if (questionId === null || charTo <= charFrom) return null
	const alignment = alignmentByQuestion.get(questionId)
	if (!alignment) return null
	const ids = tokenIdsInRange(charFrom, charTo, alignment)
	return ids.length > 0 ? ids : null
}

/**
 * Returns the tokenId at a collapsed cursor position via the runtime
 * alignment. Tries the position directly; if no token covers exactly the
 * cursor's char offset (e.g. cursor is in whitespace between aligned
 * tokens), tries one char to the left so a cursor at the trailing edge
 * of a word still highlights that word.
 */
function resolveTokenAtCursor(
	doc: PmNode,
	pos: number,
	alignmentByQuestion: ReadonlyMap<string, TokenAlignment>,
): string | null {
	const pt = pmPosToAnswerChar(doc, pos)
	if (!pt) return null
	const alignment = alignmentByQuestion.get(pt.questionId)
	if (!alignment) return null
	return tokenIdAtChar(pt.char, alignment) ?? tokenIdAtChar(pt.char - 1, alignment)
}

/**
 * Subscribes to editor transactions and maps selection / active annotation
 * to OCR token IDs for the scan overlay. All resolution goes through the
 * per-question `TokenAlignment` (produced by `useQuestionAlignments`) —
 * no PM marks are read.
 */
export function useTokenHighlight(
	editor: Editor | null,
	activeAnnotationId: string | null,
	alignmentByQuestion: ReadonlyMap<string, TokenAlignment>,
	onTokenHighlight?: (tokenIds: string[] | null) => void,
): void {
	useEffect(() => {
		if (!editor || !onTokenHighlight) return

		const handleUpdate = () => {
			const { from, to } = editor.state.selection
			const hasSelection = from !== to

			if (hasSelection) {
				onTokenHighlight(
					resolveTokensForRange(editor.state.doc, from, to, alignmentByQuestion),
				)
				return
			}

			if (activeAnnotationId) {
				onTokenHighlight(
					resolveTokensForAnnotation(
						editor.state.doc,
						activeAnnotationId,
						alignmentByQuestion,
					),
				)
				return
			}

			const cursorToken = resolveTokenAtCursor(
				editor.state.doc,
				from,
				alignmentByQuestion,
			)
			onTokenHighlight(cursorToken ? [cursorToken] : null)
		}

		handleUpdate()
		editor.on("transaction", handleUpdate)
		return () => {
			editor.off("transaction", handleUpdate)
		}
	}, [editor, activeAnnotationId, alignmentByQuestion, onTokenHighlight])
}

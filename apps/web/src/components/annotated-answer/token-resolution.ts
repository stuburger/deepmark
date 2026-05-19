import {
	type TokenAlignment,
	tokenIdAtChar,
	tokenIdsInRange,
} from "@mcp-gcse/shared"
import type { Node as PmNode } from "@tiptap/pm/model"
import { pmPosToAnswerChar, pmPosToCharInBlock } from "./pm-pos-mapping"

/**
 * Pure resolvers that map PM positions / annotation ids to OCR tokenIds via
 * the per-question runtime alignment. Extracted from `use-token-highlight`
 * so they can be unit-tested directly against real ProseMirror docs —
 * cursor/selection/annotation resolution is the load-bearing read path of
 * the scan overlay.
 */

/**
 * Map a PM range `[from, to)` to a set of tokenIds in the scan, via the
 * per-question runtime alignment. Selections that cross question
 * boundaries union the hits from each covered block — the scan overlay
 * renders highlights per-page, not per-question.
 *
 * Returns null when:
 *  - no `questionAnswer` block overlaps the range
 *  - no alignment is loaded for any overlapping block
 *  - no tokens overlap the answer-char range in any block
 */
export function resolveTokensForRange(
	doc: PmNode,
	from: number,
	to: number,
	alignmentByQuestion: ReadonlyMap<string, TokenAlignment>,
): string[] | null {
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
		if (overlapTo <= overlapFrom) return false

		const alignment = alignmentByQuestion.get(questionId)
		if (!alignment) return false

		// We already have the block + blockStart in hand from the
		// descendants walk — use `pmPosToCharInBlock` directly to avoid
		// the doc-rooted variant's redundant `doc.resolve` + ancestor walk
		// (which would re-find the same block twice per overlap).
		const charFrom = pmPosToCharInBlock(node, blockStart, overlapFrom)
		const charTo = pmPosToCharInBlock(node, blockStart, overlapTo)
		if (charFrom === null || charTo === null) return false

		const clampedTo = Math.max(charTo, charFrom + 1)
		for (const id of tokenIdsInRange(charFrom, clampedTo, alignment)) {
			if (!seen.has(id)) {
				seen.add(id)
				ids.push(id)
			}
		}
		// Don't descend further — `questionAnswer.content = "inline*"`, so
		// nothing inside can be another block node.
		return false
	})

	return ids.length > 0 ? ids : null
}

/**
 * Find every text fragment in the doc that carries `annotationId`,
 * compute the union char range inside its owning question block, and map
 * that range to tokenIds via the per-question alignment. Returns null
 * when no marks match or the alignment for the question isn't loaded.
 *
 * Critical invariant under test: when iterating children to find marks
 * we use `continue` on non-matching children, NOT `return` — `return`
 * exits the `descendants` callback and silently abandons every later
 * child, which breaks any annotation whose text doesn't start at the
 * very first child of its question block.
 */
export function resolveTokensForAnnotation(
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
 * tokens), falls back to one char to the left so a cursor at the
 * trailing edge of a word still highlights that word.
 */
export function resolveTokenAtCursor(
	doc: PmNode,
	pos: number,
	alignmentByQuestion: ReadonlyMap<string, TokenAlignment>,
): string | null {
	const pt = pmPosToAnswerChar(doc, pos)
	if (!pt) return null
	const alignment = alignmentByQuestion.get(pt.questionId)
	if (!alignment) return null
	return (
		tokenIdAtChar(pt.char, alignment) ??
		tokenIdAtChar(pt.char - 1, alignment)
	)
}

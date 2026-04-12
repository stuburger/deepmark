import type { PageToken } from "../types"
import type { ResolvedTokenSpan, TokenAlignment } from "./types"

/**
 * Reverse-maps a character range in student_answer back to OCR tokens.
 * Returns the first and last matching tokens, all token IDs in the span,
 * and a bounding box hull.
 *
 * Returns null if no tokens overlap the range.
 */
export function charRangeToTokens(
	from: number,
	to: number,
	alignment: TokenAlignment,
	tokens: PageToken[],
): ResolvedTokenSpan | null {
	// Find all tokens whose aligned char range overlaps [from, to)
	const matched: PageToken[] = []

	for (const token of tokens) {
		const offset = alignment.tokenMap[token.id]
		if (!offset) continue
		// Overlap: token.start < to AND token.end > from
		if (offset.start < to && offset.end > from) {
			matched.push(token)
		}
	}

	if (matched.length === 0) return null

	// Compute bbox hull
	let yMin = Number.POSITIVE_INFINITY
	let xMin = Number.POSITIVE_INFINITY
	let yMax = Number.NEGATIVE_INFINITY
	let xMax = Number.NEGATIVE_INFINITY

	for (const t of matched) {
		const [tYMin, tXMin, tYMax, tXMax] = t.bbox
		if (tYMin < yMin) yMin = tYMin
		if (tXMin < xMin) xMin = tXMin
		if (tYMax > yMax) yMax = tYMax
		if (tXMax > xMax) xMax = tXMax
	}

	return {
		startTokenId: matched[0].id,
		endTokenId: matched[matched.length - 1].id,
		tokenIds: matched.map((t) => t.id),
		bbox: [yMin, xMin, yMax, xMax],
		pageOrder: matched[0].page_order,
	}
}

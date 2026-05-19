import type { Anchor } from "./anchors"

/**
 * A half-open segment of the (tokens × words) plane carved out by the
 * anchor pass. The main Levenshtein walker runs once per segment with the
 * cursor constrained to `[wordStart, wordEnd)`; it cannot drift across an
 * anchor.
 */
export type Segment = {
	tokenStart: number
	tokenEnd: number
	wordStart: number
	wordEnd: number
}

/**
 * Builds the segments between locked anchors. Each segment covers the
 * tokens and words that fall strictly BETWEEN consecutive anchors (anchor
 * positions themselves are excluded — they're already placed).
 *
 * Boundary handling:
 *  - If there are no anchors, returns a single segment covering everything.
 *  - The first anchor's preceding range (token 0 → anchor.tokenIndex,
 *    word 0 → anchor.wordIndex) becomes the head segment.
 *  - The last anchor's trailing range (anchor.tokenIndex+1 → tokenCount,
 *    anchor.wordIndex+1 → wordCount) becomes the tail segment.
 *  - Adjacent anchors with no tokens between them produce no segment.
 *
 * Assumes `anchors` is sorted by tokenIndex ascending (which
 * `identifyAnchors` guarantees via LIS).
 */
export function buildSegments(
	anchors: ReadonlyArray<Anchor>,
	tokenCount: number,
	wordCount: number,
): Segment[] {
	if (anchors.length === 0) {
		return [
			{ tokenStart: 0, tokenEnd: tokenCount, wordStart: 0, wordEnd: wordCount },
		]
	}
	const segments: Segment[] = []
	let prevTokenEnd = 0
	let prevWordEnd = 0
	for (const a of anchors) {
		if (a.tokenIndex > prevTokenEnd) {
			segments.push({
				tokenStart: prevTokenEnd,
				tokenEnd: a.tokenIndex,
				wordStart: prevWordEnd,
				wordEnd: a.wordIndex,
			})
		}
		prevTokenEnd = a.tokenIndex + 1
		prevWordEnd = a.wordIndex + 1
	}
	if (prevTokenEnd < tokenCount) {
		segments.push({
			tokenStart: prevTokenEnd,
			tokenEnd: tokenCount,
			wordStart: prevWordEnd,
			wordEnd: wordCount,
		})
	}
	return segments
}

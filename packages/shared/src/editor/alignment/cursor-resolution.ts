import type { TokenAlignment } from "./types"

/**
 * Render-time cursor/range → token resolution. These helpers replace the
 * old approach of reading `ocrToken` PM marks at a cursor position: that
 * cache went stale across aligner improvements and accumulated across
 * editor-seed runs. The canonical mapping is the `TokenAlignment` returned
 * by `alignTokensToAnswer(answer, tokens)` — memoised per question at the
 * consumer (`useQuestionAlignments`).
 *
 * Char positions here are offsets into `student_answer`, NOT ProseMirror
 * doc positions. The caller is responsible for converting PM positions to
 * answer-relative char offsets before calling in (the answer block has
 * wrapper nodes that PM counts).
 */

/**
 * The single tokenId whose alignment range contains `charPos`. Returns
 * `null` if no token covers the position (e.g. cursor is on whitespace
 * between aligned tokens, or beyond the last aligned token).
 *
 * Range semantics: `[start, end)` — `end` is exclusive.
 */
export function tokenIdAtChar(
	charPos: number,
	alignment: TokenAlignment,
): string | null {
	for (const [tokenId, range] of Object.entries(alignment.tokenMap)) {
		if (charPos >= range.start && charPos < range.end) return tokenId
	}
	return null
}

/**
 * Every tokenId whose alignment range overlaps `[charFrom, charTo)`. Used
 * for selection hover (highlight every token under the user's selection)
 * and for projecting annotation char ranges back to token IDs / bboxes.
 *
 * Overlap semantics: two half-open ranges `[a, b)` and `[c, d)` overlap
 * iff `a < d && c < b`. Zero-width queries (`charFrom === charTo`) return
 * the empty array — use `tokenIdAtChar` for point lookups instead.
 *
 * Returned IDs are in `tokenMap` insertion order. Callers that need
 * spatial order (e.g. left-to-right token IDs for chunk highlight) should
 * sort by `range.start` themselves.
 */
export function tokenIdsInRange(
	charFrom: number,
	charTo: number,
	alignment: TokenAlignment,
): string[] {
	if (charTo <= charFrom) return []
	const hits: string[] = []
	for (const [tokenId, range] of Object.entries(alignment.tokenMap)) {
		if (range.start < charTo && charFrom < range.end) hits.push(tokenId)
	}
	return hits
}

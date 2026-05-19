import type { NormalisedBox, TokenAlignment } from "@mcp-gcse/shared"
import { computeBboxHull } from "@mcp-gcse/shared"

export type ResolvedSpan = {
	startTokenId: string
	endTokenId: string
	bbox: NormalisedBox
	pageOrder: number
}

/**
 * Resolve a span keyed by a char range in `student_answer`. Walks tokens and
 * keeps the ones whose char range (per the precomputed alignment) overlaps
 * [charStart, charEnd). Returns the hull bbox + first/last overlapping token
 * IDs + the page order of the first overlapping token.
 *
 * Phrase-anchored annotations (post-rework) call this — the LLM emits a
 * char range against the canonical clean answer; the bbox + per-mark token
 * IDs are a downstream presentation concern computed from the same per-
 * question token set the editor seed used.
 *
 * Returns null when no token overlaps the range (e.g. the LLM annotated a
 * piece of the answer that came from inserted punctuation / paragraph
 * breaks that have no underlying OCR token).
 */
export function resolveTokenSpanByCharRange(
	charStart: number,
	charEnd: number,
	tokens: ReadonlyArray<{ id: string; page_order: number; bbox: unknown }>,
	alignment: TokenAlignment,
): ResolvedSpan | null {
	if (charEnd <= charStart) return null
	const overlapping = tokens.filter((t) => {
		const range = alignment.tokenMap[t.id]
		if (!range) return false
		return range.start < charEnd && range.end > charStart
	})
	if (overlapping.length === 0) return null
	const first = overlapping[0]
	const last = overlapping[overlapping.length - 1]
	return {
		startTokenId: first.id,
		endTokenId: last.id,
		bbox: computeBboxHull(overlapping.map((t) => t.bbox as NormalisedBox)),
		pageOrder: first.page_order,
	}
}

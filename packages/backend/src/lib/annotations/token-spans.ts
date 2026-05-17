import type { NormalisedBox } from "@mcp-gcse/shared"
import { computeBboxHull } from "@mcp-gcse/shared"

export type ResolvedSpan = {
	startTokenId: string
	endTokenId: string
	bbox: NormalisedBox
	pageOrder: number
}

/**
 * Resolve a span keyed by START and END token IDs (the new ID-based annotation
 * anchoring used after we dropped the OCR-token-array prompt in 2026-05-17).
 * Walks the token array to find the slice between start and end (inclusive),
 * preserving order. Returns null if either ID is missing or end comes before
 * start in the token sequence.
 */
export function resolveTokenSpanByIds(
	startTokenId: string,
	endTokenId: string,
	tokens: ReadonlyArray<{ id: string; page_order: number; bbox: unknown }>,
): ResolvedSpan | null {
	const startIdx = tokens.findIndex((t) => t.id === startTokenId)
	const endIdx = tokens.findIndex((t) => t.id === endTokenId)
	if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) return null
	const span = tokens.slice(startIdx, endIdx + 1)
	const first = span[0]
	const last = span[span.length - 1]
	if (!first || !last) return null
	return {
		startTokenId: first.id,
		endTokenId: last.id,
		bbox: computeBboxHull(span.map((t) => t.bbox as NormalisedBox)),
		pageOrder: first.page_order,
	}
}

import type { NormalisedBox } from "@mcp-gcse/shared"
import { computeBboxHull } from "@mcp-gcse/shared"

/**
 * Resolve token indices to a span with bbox and token IDs.
 * Returns null for out-of-bounds indices (annotation will be skipped).
 */
export function resolveTokenSpan(
	anchorStart: number,
	anchorEnd: number,
	tokens: Array<{ id: string; page_order: number; bbox: unknown }>,
): {
	startTokenId: string
	endTokenId: string
	bbox: NormalisedBox
	pageOrder: number
} | null {
	if (
		anchorStart < 0 ||
		anchorEnd < anchorStart ||
		anchorEnd >= tokens.length
	) {
		return null
	}
	const span = tokens.slice(anchorStart, anchorEnd + 1)
	return {
		startTokenId: span[0].id,
		endTokenId: span[span.length - 1].id,
		bbox: computeBboxHull(span.map((t) => t.bbox as NormalisedBox)),
		pageOrder: span[0].page_order,
	}
}

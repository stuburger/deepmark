import type { JSONContent } from "@tiptap/core"

export type SegmentMark = {
	from: number
	to: number
	type: string
	attrs: Record<string, unknown>
}

export type SegmentToken = {
	from: number
	to: number
	tokenId: string
	bbox: [number, number, number, number]
	pageOrder: number
}

/**
 * Splits `text` at every mark and token boundary, producing tiptap text
 * nodes carrying covering marks. ocrToken marks are emitted once per
 * segment using the first covering token (tokens are not expected to
 * overlap; if they do, the earlier-sorted one wins).
 *
 * Returns `[]` for empty text. Callers needing a placeholder text node
 * (tiptap won't render an empty block) must add it themselves.
 */
export function segmentText(
	text: string,
	marks: SegmentMark[],
	tokens: SegmentToken[],
): JSONContent[] {
	if (text.length === 0) return []

	const boundaries = new Set<number>()
	boundaries.add(0)
	boundaries.add(text.length)
	for (const m of marks) {
		if (m.from >= 0 && m.from <= text.length) boundaries.add(m.from)
		if (m.to >= 0 && m.to <= text.length) boundaries.add(m.to)
	}
	for (const t of tokens) {
		if (t.from >= 0 && t.from <= text.length) boundaries.add(t.from)
		if (t.to >= 0 && t.to <= text.length) boundaries.add(t.to)
	}

	const sorted = [...boundaries].sort((a, b) => a - b)
	const nodes: JSONContent[] = []

	for (let i = 0; i < sorted.length - 1; i++) {
		const start = sorted[i]
		const end = sorted[i + 1]
		if (start === end) continue

		const segText = text.slice(start, end)
		const node: JSONContent = { type: "text", text: segText }
		const segmentMarks: NonNullable<JSONContent["marks"]> = []

		for (const m of marks) {
			if (m.from < end && m.to > start) {
				segmentMarks.push({ type: m.type, attrs: m.attrs })
			}
		}

		const coveringToken = tokens.find((t) => t.from < end && t.to > start)
		if (coveringToken) {
			segmentMarks.push({
				type: "ocrToken",
				attrs: {
					tokenId: coveringToken.tokenId,
					bbox: coveringToken.bbox,
					pageOrder: coveringToken.pageOrder,
				},
			})
		}

		if (segmentMarks.length > 0) node.marks = segmentMarks
		nodes.push(node)
	}

	return nodes
}

import type { TextMark, TextSegment } from "./types"

/**
 * Splits text into segments at mark boundaries (interval-splitting algorithm).
 * Each segment carries the list of marks covering it.
 */
export function splitIntoSegments(
	text: string,
	marks: TextMark[],
): TextSegment[] {
	if (text.length === 0) return []
	if (marks.length === 0) return [{ text, marks: [] }]

	// Collect unique boundary points
	const boundaries = new Set<number>()
	boundaries.add(0)
	boundaries.add(text.length)
	for (const m of marks) {
		if (m.from >= 0 && m.from <= text.length) boundaries.add(m.from)
		if (m.to >= 0 && m.to <= text.length) boundaries.add(m.to)
	}

	const sorted = [...boundaries].sort((a, b) => a - b)
	const segments: TextSegment[] = []

	for (let i = 0; i < sorted.length - 1; i++) {
		const start = sorted[i]
		const end = sorted[i + 1]
		if (start === end) continue

		const segmentText = text.slice(start, end)
		const coveringMarks = marks.filter((m) => m.from < end && m.to > start)

		segments.push({ text: segmentText, marks: coveringMarks })
	}

	return segments
}

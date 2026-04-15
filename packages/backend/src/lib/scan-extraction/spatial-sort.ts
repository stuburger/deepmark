/**
 * Sorts tokens into correct reading order using bounding box positions,
 * ignoring Cloud Vision's paragraph/line/word index hierarchy which can
 * produce incorrect reading order when Vision fragments text into many
 * small paragraphs or misorders adjacent blocks.
 *
 * Algorithm:
 * 1. Compute the vertical midpoint (midY) of each token's bbox.
 * 2. Sort all tokens by midY ascending.
 * 3. Group into "lines": tokens whose midY falls within LINE_THRESHOLD of
 *    the first token in the current group belong to the same line.
 * 4. Within each line, sort by xMin ascending (left → right).
 *
 * Bbox format: [yMin, xMin, yMax, xMax] normalised 0–1000.
 */

/**
 * Vertical distance (0–1000 space) within which two tokens are treated as
 * being on the same line. Typical handwritten line height is ~30–40 units,
 * so 15 units catches normal within-line variation without merging adjacent
 * lines.
 */
const LINE_THRESHOLD = 15

type WithBbox = { bbox: unknown }

function extractBbox(bbox: unknown): [number, number, number, number] {
	if (
		Array.isArray(bbox) &&
		bbox.length === 4 &&
		bbox.every((v) => typeof v === "number")
	) {
		return bbox as [number, number, number, number]
	}
	return [0, 0, 0, 0]
}

export function sortTokensSpatially<T extends WithBbox>(tokens: T[]): T[] {
	if (tokens.length <= 1) return tokens

	type Item = { token: T; midY: number; xMin: number }

	const items: Item[] = tokens.map((t) => {
		const [yMin, xMin, yMax] = extractBbox(t.bbox)
		return { token: t, midY: (yMin + yMax) / 2, xMin }
	})

	// Sort by vertical centre, ascending.
	items.sort((a, b) => a.midY - b.midY)

	// Group into lines using the first token's midY as the line anchor.
	const lines: Item[][] = [[items[0]]]
	for (let i = 1; i < items.length; i++) {
		const item = items[i]
		const currentLine = lines[lines.length - 1]
		const anchorMidY = currentLine[0].midY
		if (Math.abs(item.midY - anchorMidY) <= LINE_THRESHOLD) {
			currentLine.push(item)
		} else {
			lines.push([item])
		}
	}

	// Sort each line left → right.
	for (const line of lines) {
		line.sort((a, b) => a.xMin - b.xMin)
	}

	return lines.flat().map((item) => item.token)
}

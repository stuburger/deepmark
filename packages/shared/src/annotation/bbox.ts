/** [yMin, xMin, yMax, xMax] normalised 0–1000 */
export type NormalisedBox = [number, number, number, number]

/**
 * Compute the bounding box hull of multiple bounding boxes — the smallest
 * rectangle that contains all of them.
 */
export function computeBboxHull(bboxes: NormalisedBox[]): NormalisedBox {
	let yMin = 1000
	let xMin = 1000
	let yMax = 0
	let xMax = 0
	for (const [y1, x1, y2, x2] of bboxes) {
		if (y1 < yMin) yMin = y1
		if (x1 < xMin) xMin = x1
		if (y2 > yMax) yMax = y2
		if (x2 > xMax) xMax = x2
	}
	return [yMin, xMin, yMax, xMax]
}

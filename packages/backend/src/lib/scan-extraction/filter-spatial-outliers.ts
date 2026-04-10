/**
 * Filters spatially isolated tokens from a set of bounding boxes before
 * hull computation. Prevents a single misattributed token from stretching
 * the answer region across the entire page.
 *
 * Algorithm:
 * 1. Sort bboxes by yMin (top of each token).
 * 2. Walk the sorted list and find "gaps" — vertical distances between
 *    consecutive tokens that are significantly larger than the typical
 *    inter-token spacing. The threshold is 3× the median gap.
 * 3. Split into clusters at each large gap.
 * 4. Keep only the largest cluster (by token count).
 *
 * Bbox format: [yMin, xMin, yMax, xMax]
 */

type Bbox = [number, number, number, number]

/**
 * Compute the median of a sorted numeric array.
 * Assumes the array is already sorted ascending and non-empty.
 */
function medianOfSorted(sorted: number[]): number {
	const mid = Math.floor(sorted.length / 2)
	if (sorted.length % 2 === 0) {
		return (sorted[mid - 1] + sorted[mid]) / 2
	}
	return sorted[mid]
}

/**
 * Given an array of bounding boxes, removes spatial outliers by keeping
 * only the largest vertically contiguous cluster.
 *
 * Returns the filtered array. If there are fewer than 3 bboxes, returns
 * the input unchanged (can't meaningfully detect outliers).
 */
export function filterSpatialOutliers(bboxes: Bbox[]): Bbox[] {
	// Need at least 3 tokens to detect an outlier — with 2 tokens,
	// both could be "the cluster" and we'd be guessing.
	if (bboxes.length < 3) return bboxes

	// Sort by yMin (top edge of each token).
	const sorted = [...bboxes].sort((a, b) => a[0] - b[0])

	// Compute gaps between consecutive tokens (by yMin).
	const gaps: number[] = []
	for (let i = 1; i < sorted.length; i++) {
		gaps.push(sorted[i][0] - sorted[i - 1][0])
	}

	// Find the median gap — this represents the "normal" spacing between
	// tokens in the same answer region (typically a few pixels).
	const sortedGaps = [...gaps].sort((a, b) => a - b)
	const medianGap = medianOfSorted(sortedGaps)

	// A gap is "large" if it's more than 3× the median gap AND at least
	// 30px in absolute terms. The absolute floor prevents false splits
	// when all gaps are tiny (e.g. median=2px → threshold=6px would
	// split normal line breaks).
	const GAP_MULTIPLIER = 3
	const MIN_ABSOLUTE_GAP = 30
	const threshold = Math.max(medianGap * GAP_MULTIPLIER, MIN_ABSOLUTE_GAP)

	// Split into clusters at each large gap.
	const clusters: Bbox[][] = [[sorted[0]]]
	for (let i = 0; i < gaps.length; i++) {
		if (gaps[i] > threshold) {
			// Start a new cluster.
			clusters.push([])
		}
		clusters[clusters.length - 1].push(sorted[i + 1])
	}

	// Keep only the largest cluster. If there are ties, keep the first
	// (topmost) — but ties are rare in practice.
	let largest = clusters[0]
	for (const cluster of clusters) {
		if (cluster.length > largest.length) {
			largest = cluster
		}
	}

	return largest
}

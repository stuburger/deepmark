/**
 * Longest Increasing Subsequence (by a key extractor).
 *
 * Returns the longest subset of `items` (in original order) such that the
 * extracted key strictly increases. Used by the alignment anchor pass to
 * isolate outlier anchors: when one rogue anchor would push later anchors
 * "backwards" relative to it, LIS picks the subset that maximises kept
 * anchors instead of greedily applying the first arrival.
 *
 * Implementation: O(n²) DP with predecessor pointers. Fine for n in the
 * dozens (anchor counts per question). If n ever pushes into the thousands,
 * switch to the O(n log n) patience-sorting variant.
 *
 * Stable for ties on the key: when two items would extend the same chain
 * length, the earlier item wins (it has a smaller index and got there first).
 */
export function longestIncreasingSubsequence<T>(
	items: ReadonlyArray<T>,
	key: (item: T) => number,
): T[] {
	const n = items.length
	if (n <= 1) return items.slice()

	// dp[i] = length of the LIS ending at i
	// prev[i] = index of predecessor in the chain ending at i, or -1
	const dp = new Array<number>(n).fill(1)
	const prev = new Array<number>(n).fill(-1)
	let bestEnd = 0

	for (let i = 1; i < n; i++) {
		const ki = key(items[i])
		for (let j = 0; j < i; j++) {
			if (key(items[j]) < ki && dp[j] + 1 > dp[i]) {
				dp[i] = dp[j] + 1
				prev[i] = j
			}
		}
		if (dp[i] > dp[bestEnd]) bestEnd = i
	}

	const out: T[] = []
	for (let k: number = bestEnd; k !== -1; k = prev[k]) out.push(items[k])
	return out.reverse()
}

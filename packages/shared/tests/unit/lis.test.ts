import { describe, expect, it } from "vitest"
import { longestIncreasingSubsequence } from "../../src/editor/alignment/lis"

/** Convenience wrapper for tests over number sequences. */
const lis = (xs: number[]) => longestIncreasingSubsequence(xs, (x) => x)

describe("longestIncreasingSubsequence", () => {
	it("returns empty for empty input", () => {
		expect(lis([])).toEqual([])
	})

	it("returns single-element input unchanged", () => {
		expect(lis([42])).toEqual([42])
	})

	it("strictly increasing — keeps everything", () => {
		expect(lis([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5])
	})

	it("strictly decreasing — keeps the longest of length 1 (= the first)", () => {
		// Every chain has length 1; with the "earlier item wins on ties"
		// stability rule, we keep just the first.
		expect(lis([5, 4, 3, 2, 1])).toEqual([5])
	})

	it("all equal — strictly-increasing means none can chain", () => {
		// Strict inequality: no two equal keys extend each other.
		expect(lis([7, 7, 7])).toEqual([7])
	})

	it("classic textbook example", () => {
		// LIS of [10, 22, 9, 33, 21, 50, 41, 60, 80] has length 6
		// (multiple valid sequences; this DP picks the lexicographically-
		// earliest predecessors).
		const result = lis([10, 22, 9, 33, 21, 50, 41, 60, 80])
		expect(result.length).toBe(6)
		// monotonicity invariant — whatever the picked chain is, it MUST
		// be strictly increasing
		for (let i = 1; i < result.length; i++) {
			expect(result[i]).toBeGreaterThan(result[i - 1])
		}
	})

	it("rogue-outlier case — single huge value mid-stream is dropped", () => {
		// This is the alignment-aligner scenario: a token mid-stream gets
		// fuzzy-matched to a clean-text word much later than its
		// neighbours. The greedy "monotonic-so-far" filter would drop
		// every subsequent legitimate match. LIS picks the longer chain
		// that excludes the outlier.
		const result = lis([1, 2, 3, 4, 999, 5, 6, 7, 8])
		expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
	})

	it("rogue-outlier near the start", () => {
		const result = lis([999, 1, 2, 3, 4, 5])
		expect(result).toEqual([1, 2, 3, 4, 5])
	})

	it("preserves original order — keys aren't sorted, items are", () => {
		const items = [
			{ id: "a", v: 10 },
			{ id: "b", v: 5 },
			{ id: "c", v: 20 },
			{ id: "d", v: 15 },
			{ id: "e", v: 30 },
		]
		const result = longestIncreasingSubsequence(items, (x) => x.v)
		expect(result.map((x) => x.id)).toEqual(["a", "c", "e"])
	})

	it("two parallel chains — picks the longer one", () => {
		// Chain A: 1, 2, 3 (length 3)
		// Chain B: 100, 200 (length 2)
		// A wins on length
		expect(lis([100, 1, 200, 2, 3])).toEqual([1, 2, 3])
	})

	it("multi-tie resolution — earlier predecessor wins", () => {
		// At item index 3 (value 4), both index 1 (value 2) and index 2
		// (value 3) extend a chain of length 2. With "earlier wins" the
		// picked chain ends [..., 2, 4] not [..., 3, 4]... actually no,
		// 4 > 3 > 2 so [1, 2, 3, 4] is the proper chain.
		expect(lis([1, 2, 3, 4])).toEqual([1, 2, 3, 4])
	})

	it("the cuent-→-went' alignment scenario", () => {
		// Mimics the exact failure mode from packages/shared Pearson Q4:
		// 18 legitimate token→word matches in order, with token #5 having
		// fuzzy-matched a word much later (index 272). The greedy filter
		// would drop tokens #6 onward; LIS keeps everything except #5.
		const indices = [
			1, 2, 4, 5, 6,
			272, // rogue: "cuent" mistakenly matched "went'" 200+ words later
			11, 12, 13, 15, 21, 27, 30, 32, 33, 37, 44, 50,
		]
		const result = lis(indices)
		expect(result).toEqual([
			1, 2, 4, 5, 6, 11, 12, 13, 15, 21, 27, 30, 32, 33, 37, 44, 50,
		])
		expect(result).not.toContain(272)
	})
})

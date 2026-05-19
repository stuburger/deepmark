import { describe, expect, it } from "vitest"
import {
	tokenIdAtChar,
	tokenIdsInRange,
} from "../../src/editor/alignment/cursor-resolution"
import type { TokenAlignment } from "../../src/editor/alignment/types"

function align(
	entries: Array<[string, number, number]>,
	confidence = 1,
): TokenAlignment {
	const tokenMap: Record<string, { start: number; end: number }> = {}
	for (const [id, start, end] of entries) tokenMap[id] = { start, end }
	return { tokenMap, confidence }
}

describe("tokenIdAtChar", () => {
	it("returns the tokenId whose range contains the position", () => {
		const a = align([
			["t1", 0, 5],
			["t2", 6, 10],
			["t3", 11, 14],
		])
		expect(tokenIdAtChar(0, a)).toBe("t1")
		expect(tokenIdAtChar(4, a)).toBe("t1")
		expect(tokenIdAtChar(6, a)).toBe("t2")
		expect(tokenIdAtChar(13, a)).toBe("t3")
	})

	it("treats `end` as exclusive", () => {
		const a = align([["t1", 0, 5]])
		expect(tokenIdAtChar(5, a)).toBeNull()
	})

	it("returns null in a whitespace gap between tokens", () => {
		const a = align([
			["t1", 0, 5],
			["t2", 6, 10],
		])
		expect(tokenIdAtChar(5, a)).toBeNull()
	})

	it("returns null past the last token", () => {
		const a = align([["t1", 0, 5]])
		expect(tokenIdAtChar(99, a)).toBeNull()
	})

	it("returns null on an empty alignment", () => {
		expect(tokenIdAtChar(0, align([]))).toBeNull()
	})

	it("negative positions return null", () => {
		const a = align([["t1", 0, 5]])
		expect(tokenIdAtChar(-1, a)).toBeNull()
	})
})

describe("tokenIdsInRange", () => {
	const a = align([
		["t1", 0, 5],
		["t2", 6, 10],
		["t3", 11, 14],
		["t4", 15, 20],
	])

	it("returns every tokenId overlapping the range", () => {
		expect(tokenIdsInRange(0, 14, a).sort()).toEqual(["t1", "t2", "t3"])
	})

	it("partial overlap at the start counts", () => {
		// query [3, 7) — touches t1 (0..5) and t2 (6..10)
		expect(tokenIdsInRange(3, 7, a).sort()).toEqual(["t1", "t2"])
	})

	it("partial overlap at the end counts", () => {
		// query [8, 12) — touches t2 (6..10) and t3 (11..14)
		expect(tokenIdsInRange(8, 12, a).sort()).toEqual(["t2", "t3"])
	})

	it("range entirely inside a single token returns just that token", () => {
		expect(tokenIdsInRange(1, 3, a)).toEqual(["t1"])
	})

	it("range in whitespace gap returns empty", () => {
		expect(tokenIdsInRange(5, 6, a)).toEqual([])
	})

	it("zero-width query returns empty (use tokenIdAtChar for points)", () => {
		expect(tokenIdsInRange(3, 3, a)).toEqual([])
	})

	it("inverted range (to <= from) returns empty", () => {
		expect(tokenIdsInRange(10, 3, a)).toEqual([])
	})

	it("range fully past the last token returns empty", () => {
		expect(tokenIdsInRange(99, 200, a)).toEqual([])
	})

	it("empty alignment returns empty", () => {
		expect(tokenIdsInRange(0, 100, align([]))).toEqual([])
	})

	it("`end`-touching query does not include the touched token (half-open)", () => {
		// query [5, 6) — t1 ends at 5 (exclusive), gap starts at 5, t2 starts at 6
		expect(tokenIdsInRange(5, 6, a)).toEqual([])
	})
})

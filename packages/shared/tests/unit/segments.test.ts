import { describe, expect, it } from "vitest"
import type { Anchor } from "../../src/editor/alignment/anchors"
import { buildSegments } from "../../src/editor/alignment/segments"

const a = (tokenIndex: number, wordIndex: number): Anchor => ({
	tokenIndex,
	wordIndex,
})

describe("buildSegments", () => {
	it("returns a single segment covering everything when no anchors", () => {
		expect(buildSegments([], 100, 80)).toEqual([
			{ tokenStart: 0, tokenEnd: 100, wordStart: 0, wordEnd: 80 },
		])
	})

	it("returns empty when there are no tokens", () => {
		expect(buildSegments([], 0, 0)).toEqual([
			{ tokenStart: 0, tokenEnd: 0, wordStart: 0, wordEnd: 0 },
		])
	})

	it("one anchor in the middle — produces head + tail segments", () => {
		const result = buildSegments([a(10, 8)], 20, 16)
		expect(result).toEqual([
			{ tokenStart: 0, tokenEnd: 10, wordStart: 0, wordEnd: 8 },
			{ tokenStart: 11, tokenEnd: 20, wordStart: 9, wordEnd: 16 },
		])
	})

	it("anchor at token index 0 — no head segment", () => {
		const result = buildSegments([a(0, 0)], 20, 16)
		expect(result).toEqual([
			{ tokenStart: 1, tokenEnd: 20, wordStart: 1, wordEnd: 16 },
		])
	})

	it("anchor at the final token index — no tail segment", () => {
		const result = buildSegments([a(19, 15)], 20, 16)
		expect(result).toEqual([
			{ tokenStart: 0, tokenEnd: 19, wordStart: 0, wordEnd: 15 },
		])
	})

	it("multiple anchors — segment between each pair", () => {
		const result = buildSegments([a(5, 4), a(10, 9), a(15, 13)], 20, 18)
		expect(result).toEqual([
			{ tokenStart: 0, tokenEnd: 5, wordStart: 0, wordEnd: 4 },
			{ tokenStart: 6, tokenEnd: 10, wordStart: 5, wordEnd: 9 },
			{ tokenStart: 11, tokenEnd: 15, wordStart: 10, wordEnd: 13 },
			{ tokenStart: 16, tokenEnd: 20, wordStart: 14, wordEnd: 18 },
		])
	})

	it("adjacent anchors produce no inter-segment", () => {
		// anchors at consecutive token indexes — nothing between them
		const result = buildSegments([a(5, 4), a(6, 5)], 10, 8)
		expect(result).toEqual([
			{ tokenStart: 0, tokenEnd: 5, wordStart: 0, wordEnd: 4 },
			{ tokenStart: 7, tokenEnd: 10, wordStart: 6, wordEnd: 8 },
		])
	})

	it("all segments preserve non-decreasing token + word boundaries", () => {
		const result = buildSegments([a(3, 2), a(8, 6), a(12, 10)], 15, 13)
		for (let i = 1; i < result.length; i++) {
			expect(result[i].tokenStart).toBeGreaterThanOrEqual(result[i - 1].tokenEnd)
			expect(result[i].wordStart).toBeGreaterThanOrEqual(result[i - 1].wordEnd)
		}
	})

	it("anchor word index can lead token index — segments still well-formed", () => {
		// LLM-authored answer can have fewer words than tokens (consolidation
		// of punctuation tokens). The aligner shouldn't crash when word
		// progress trails token progress.
		const result = buildSegments([a(3, 5), a(7, 12)], 10, 15)
		for (const seg of result) {
			expect(seg.tokenEnd).toBeGreaterThanOrEqual(seg.tokenStart)
			expect(seg.wordEnd).toBeGreaterThanOrEqual(seg.wordStart)
		}
	})
})

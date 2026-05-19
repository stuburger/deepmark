import { describe, expect, it } from "vitest"
import {
	CLASSIFY_SAMPLE_PAGES,
	CLASSIFY_SAMPLE_THRESHOLD,
	sampleIndices,
} from "../classify-sampling"

describe("sampleIndices", () => {
	it("returns every index in order when total <= count (passthrough)", () => {
		expect(sampleIndices(5, 5)).toEqual([0, 1, 2, 3, 4])
		expect(sampleIndices(3, 5)).toEqual([0, 1, 2])
		expect(sampleIndices(1, 5)).toEqual([0])
		expect(sampleIndices(0, 5)).toEqual([])
	})

	it("always includes the first and last page index when sampling", () => {
		for (const total of [11, 50, 100, 300, 9999]) {
			const indices = sampleIndices(total, CLASSIFY_SAMPLE_PAGES)
			expect(indices[0]).toBe(0)
			expect(indices.at(-1)).toBe(total - 1)
		}
	})

	it("returns sorted ascending indices with no duplicates", () => {
		const cases = [11, 25, 50, 300, 9999]
		for (const total of cases) {
			const indices = sampleIndices(total, CLASSIFY_SAMPLE_PAGES)
			const sorted = [...indices].sort((a, b) => a - b)
			expect(indices).toEqual(sorted)
			expect(new Set(indices).size).toBe(indices.length)
		}
	})

	it("spaces inner samples evenly across the document", () => {
		// 300-page doc, 5 samples: cover, ~25%, ~50%, ~75%, back.
		// Math.round(i * 299 / 4) for i = 1..3 → 75, 150, 224.
		expect(sampleIndices(300, 5)).toEqual([0, 75, 150, 224, 299])
		// 50-page → cover, ~25%, ~50%, ~75%, back.
		expect(sampleIndices(50, 5)).toEqual([0, 12, 25, 37, 49])
	})

	it("returns exactly `count` indices when total > count", () => {
		for (const total of [11, 50, 100, 300, 9999]) {
			expect(sampleIndices(total, CLASSIFY_SAMPLE_PAGES)).toHaveLength(
				CLASSIFY_SAMPLE_PAGES,
			)
		}
	})

	it("switches from passthrough to sampling at total === count + 1", () => {
		// total <= count is passthrough (every index); total > count samples.
		expect(sampleIndices(CLASSIFY_SAMPLE_PAGES, CLASSIFY_SAMPLE_PAGES))
			.toHaveLength(CLASSIFY_SAMPLE_PAGES)
		expect(
			sampleIndices(CLASSIFY_SAMPLE_PAGES + 1, CLASSIFY_SAMPLE_PAGES),
		).toHaveLength(CLASSIFY_SAMPLE_PAGES)
	})

	it("exports a threshold less than the sample size guard would let through", () => {
		// Caller-side invariant: anything the caller decides to sample
		// (total > CLASSIFY_SAMPLE_THRESHOLD) is large enough for
		// sampleIndices to actually subset (CLASSIFY_SAMPLE_PAGES indices).
		// Otherwise we'd be paying the round-trip through PDFDocument for
		// zero payload reduction.
		expect(CLASSIFY_SAMPLE_THRESHOLD).toBeGreaterThan(CLASSIFY_SAMPLE_PAGES)
	})

	it("never asks for indices outside the document range", () => {
		for (const total of [11, 50, 100, 300, 9999]) {
			const indices = sampleIndices(total, CLASSIFY_SAMPLE_PAGES)
			for (const i of indices) {
				expect(i).toBeGreaterThanOrEqual(0)
				expect(i).toBeLessThan(total)
			}
		}
	})
})

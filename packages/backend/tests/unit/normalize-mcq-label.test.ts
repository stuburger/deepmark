import { describe, expect, it } from "vitest"
import { normalizeMcqLabel } from "../../src/lib/scan-extraction/normalize-mcq-label"

describe("normalizeMcqLabel", () => {
	it("passes through a clean single letter", () => {
		expect(normalizeMcqLabel("C")).toBe("C")
	})

	it("uppercases a lowercase letter", () => {
		expect(normalizeMcqLabel("c")).toBe("C")
	})

	it("trims surrounding whitespace", () => {
		expect(normalizeMcqLabel("  C  ")).toBe("C")
	})

	it("keeps a multi-select run (e.g. 'AB')", () => {
		expect(normalizeMcqLabel("AB")).toBe("AB")
	})

	it("strips trailing option text after a separator — the original bug", () => {
		// "C - Farming" was the OCR output that exploded the deterministic
		// marker into [A,C,F,G,I,M,N,R] for submission cmolh3tba000002lau6ezpz8u.
		expect(normalizeMcqLabel("C - Farming")).toBe("C")
		expect(normalizeMcqLabel("A - Banks are more likely to provide loans")).toBe(
			"A",
		)
	})

	it("strips trailing option text without a dash", () => {
		expect(normalizeMcqLabel("C Farming")).toBe("C")
	})

	it("returns '' for option text only (no leading label)", () => {
		// Falls back to attribution-authored answer downstream.
		expect(normalizeMcqLabel("Farming")).toBe("")
	})

	it("returns '' for empty / whitespace input", () => {
		expect(normalizeMcqLabel("")).toBe("")
		expect(normalizeMcqLabel("   ")).toBe("")
	})

	it("returns '' when no leading letter run exists", () => {
		expect(normalizeMcqLabel("- C")).toBe("")
		expect(normalizeMcqLabel("(C)")).toBe("")
	})
})

import type { TextMark } from "@mcp-gcse/shared"
import { describe, expect, it } from "vitest"
import { clipMarksToLine, splitIntoLines } from ".."

function mark(from: number, to: number): TextMark {
	return {
		from,
		to,
		type: "tick",
		sentiment: "positive",
		attrs: {},
		annotationId: `a-${from}-${to}`,
	}
}

describe("splitIntoLines", () => {
	it("treats a single-line input as one line spanning the whole range", () => {
		expect(splitIntoLines("hello world")).toEqual([
			{ text: "hello world", start: 0, end: 11 },
		])
	})

	it("preserves absolute char offsets across newlines", () => {
		const lines = splitIntoLines("ab\ncde\nf")
		// "ab" spans 0–2, the "\n" is at 2 (consumed). "cde" 3–6, "\n" at 6.
		// "f" 7–8.
		expect(lines).toEqual([
			{ text: "ab", start: 0, end: 2 },
			{ text: "cde", start: 3, end: 6 },
			{ text: "f", start: 7, end: 8 },
		])
	})

	it("emits empty lines for consecutive newlines", () => {
		const lines = splitIntoLines("a\n\nb")
		expect(lines).toEqual([
			{ text: "a", start: 0, end: 1 },
			{ text: "", start: 2, end: 2 },
			{ text: "b", start: 3, end: 4 },
		])
	})

	it("handles empty input as one empty line", () => {
		expect(splitIntoLines("")).toEqual([{ text: "", start: 0, end: 0 }])
	})
})

describe("clipMarksToLine", () => {
	it("rebases marks within the line to local offsets", () => {
		const marks = [mark(5, 10)]
		expect(clipMarksToLine(marks, 3, 12)).toEqual([
			{ ...marks[0], from: 2, to: 7 },
		])
	})

	it("drops marks fully outside the line", () => {
		expect(clipMarksToLine([mark(0, 3)], 5, 10)).toEqual([])
		expect(clipMarksToLine([mark(20, 30)], 5, 10)).toEqual([])
	})

	it("clips marks that straddle the start of the line", () => {
		const result = clipMarksToLine([mark(2, 8)], 5, 10)
		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({ from: 0, to: 3 })
	})

	it("clips marks that straddle the end of the line", () => {
		const result = clipMarksToLine([mark(7, 14)], 5, 10)
		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({ from: 2, to: 5 })
	})

	it("drops zero-width marks (from === to after clipping)", () => {
		// A mark whose entire range coincides with the line boundary is
		// dropped — there's no character span to render.
		expect(clipMarksToLine([mark(5, 5)], 5, 10)).toEqual([])
	})
})

import type { TextMark, TextSegment } from "@mcp-gcse/shared"
import { describe, expect, it } from "vitest"
import { CHAIN_BG, MARK_COLOURS, deriveSegmentStyle } from ".."

function mark(
	type: TextMark["type"],
	attrs: Record<string, unknown> = {},
	overrides: Partial<TextMark> = {},
): TextMark {
	return {
		from: 0,
		to: 5,
		type,
		sentiment: "neutral",
		attrs,
		annotationId: `a-${type}`,
		...overrides,
	}
}

function segment(text: string, marks: TextMark[]): TextSegment {
	return { text, marks }
}

describe("deriveSegmentStyle", () => {
	it("returns no style for an unmarked segment", () => {
		const style = deriveSegmentStyle(segment("hello", []))
		expect(style.backgroundColor).toBeUndefined()
		expect(style.textDecoration).toBeUndefined()
		expect(style.textDecorationColor).toBeUndefined()
		expect(style.outline).toBeUndefined()
		expect(style.leadingSymbol).toBeNull()
		expect(style.trailingAoLabels).toEqual([])
	})

	it("leaves text colour alone for tick (only adds the leading + glyph)", () => {
		const style = deriveSegmentStyle(segment("good", [mark("tick")]))
		// Text stays black — the green '+' before the segment is the signal.
		expect(style.leadingSymbol).toBe("+")
		expect(style.textDecoration).toBeUndefined()
		expect(style.textDecorationColor).toBeUndefined()
		expect(style.backgroundColor).toBeUndefined()
		expect(style.outline).toBeUndefined()
	})

	it("leaves text colour alone for cross (only adds the leading × glyph)", () => {
		const style = deriveSegmentStyle(segment("bad", [mark("cross")]))
		expect(style.leadingSymbol).toBe("x")
		expect(style.textDecoration).toBeUndefined()
		expect(style.textDecorationColor).toBeUndefined()
	})

	it("colours the underline (not the text) for an underline mark", () => {
		const style = deriveSegmentStyle(segment("x", [mark("underline")]))
		expect(style.textDecoration).toBe("underline")
		expect(style.textDecorationColor).toBe(MARK_COLOURS.underline)
	})

	it("colours the underline (not the text) for a double-underline mark", () => {
		const style = deriveSegmentStyle(segment("x", [mark("double_underline")]))
		expect(style.textDecoration).toBe("underline double")
		expect(style.textDecorationColor).toBe(MARK_COLOURS.double_underline)
	})

	it("highlights with #FEF3C7 for circle (no text colour)", () => {
		const style = deriveSegmentStyle(segment("x", [mark("circle")]))
		expect(style.backgroundColor).toBe("#FEF3C7")
		expect(style.textDecoration).toBeUndefined()
	})

	it("draws a coloured outline for a box mark (no text colour)", () => {
		const style = deriveSegmentStyle(segment("x", [mark("box")]))
		expect(style.outline).toBe(`0.75pt solid ${MARK_COLOURS.box}`)
		expect(style.textDecoration).toBeUndefined()
	})

	it("uses chain backgrounds keyed by chainType", () => {
		expect(
			deriveSegmentStyle(
				segment("x", [mark("chain", { chainType: "evaluation" })]),
			).backgroundColor,
		).toBe(CHAIN_BG.evaluation)
		expect(
			deriveSegmentStyle(
				segment("x", [mark("chain", { chainType: "judgement" })]),
			).backgroundColor,
		).toBe(CHAIN_BG.judgement)
	})

	it("falls back to reasoning bg for an unknown chainType", () => {
		const style = deriveSegmentStyle(
			segment("x", [mark("chain", { chainType: "unknown" })]),
		)
		expect(style.backgroundColor).toBe(CHAIN_BG.reasoning)
	})

	it("collects unique trailing AO labels", () => {
		const style = deriveSegmentStyle(
			segment("x", [
				mark("underline", { ao_category: "AO1" }),
				mark("underline", { ao_category: "AO1" }), // duplicate — should dedupe
				mark("underline", { ao_category: "AO2" }),
			]),
		)
		expect(style.trailingAoLabels.map((a) => a.label)).toEqual(["AO1", "AO2"])
	})

	it("composes underline + AO + tick leading without colouring the body text", () => {
		const style = deriveSegmentStyle(
			segment("x", [mark("tick"), mark("underline", { ao_category: "AO1" })]),
		)
		expect(style.leadingSymbol).toBe("+")
		expect(style.textDecoration).toBe("underline")
		expect(style.textDecorationColor).toBe(MARK_COLOURS.underline)
		expect(style.trailingAoLabels).toHaveLength(1)
	})
})

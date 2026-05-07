import type { TextMark } from "@mcp-gcse/shared"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server.edge"
import { describe, expect, it } from "vitest"
import { AnnotatedAnswer } from "../annotated-answer"

function mark(
	from: number,
	to: number,
	type: TextMark["type"],
	attrs: Record<string, unknown> = {},
): TextMark {
	return {
		from,
		to,
		type,
		sentiment: "neutral",
		attrs,
		annotationId: `a-${from}-${to}-${type}`,
	}
}

function render(answerText: string, marks: TextMark[]): string {
	return renderToStaticMarkup(
		createElement(AnnotatedAnswer, { answerText, marks }),
	)
}

describe("AnnotatedAnswer", () => {
	it("renders plain text when no marks are supplied", () => {
		const html = render("A simple answer.", [])
		expect(html).toContain("A simple answer.")
		expect(html).not.toContain("ao-label")
	})

	it("draws a leading + and tick green on the GLYPH only — not the body text", () => {
		const html = render("good point.", [mark(0, 10, "tick")])
		expect(html).toContain("+ ")
		// Body text segment renders without an inline style attribute (React
		// drops empty style objects entirely).
		expect(html).toContain("<span>good point</span>")
		// The +'s leading-symbol span IS coloured.
		expect(html).toContain("color:#16A34A")
	})

	it("draws a leading × and cross red on the GLYPH only — not the body text", () => {
		const html = render("wrong here.", [mark(0, 5, "cross")])
		expect(html).toContain("× ")
		expect(html).toContain("<span>wrong</span>")
		expect(html).toContain("color:#DC2626")
	})

	it("underlines coloured (not the text) for an underline mark", () => {
		const html = render("emphasised here.", [mark(0, 10, "underline")])
		expect(html).toContain("text-decoration:underline")
		// text-decoration-color paints the underline, not the text.
		expect(html).toContain("text-decoration-color:#3B82F6")
	})

	it("draws a coloured outline for a box mark (no text recolour)", () => {
		const html = render("key term.", [mark(0, 8, "box")])
		expect(html).toContain("outline:0.75pt solid #9333EA")
	})

	it("appends an AO label after the marked range", () => {
		const html = render("knows the rule.", [
			mark(0, 5, "underline", { ao_category: "AO1" }),
		])
		expect(html).toContain("ao-label")
		expect(html).toContain("[AO1]")
	})

	it("renders multi-mark composition (chain bg + AO label)", () => {
		const html = render("complex reasoning.", [
			mark(0, 18, "chain", { chainType: "reasoning", ao_category: "AO2" }),
		])
		expect(html).toContain("background-color:#DBEAFE")
		expect(html).toContain("[AO2]")
	})

	it("preserves multi-line answers and clips marks per line", () => {
		const html = render("first line\nsecond line", [
			mark(0, 5, "tick"), // "first" only
		])
		// Two paragraphs (one per line)
		expect((html.match(/<p class="answer-text">/g) ?? []).length).toBe(2)
		// One leading + on the first line, none on the second
		expect((html.match(/\+\s/g) ?? []).length).toBe(1)
	})

	it("matches a stable snapshot for the canonical multi-mark fixture", () => {
		const text = "Photosynthesis happens in chloroplasts."
		const marks = [
			mark(0, 14, "tick"),
			mark(15, 22, "underline", { ao_category: "AO1" }),
			mark(26, 38, "circle"),
		]
		expect(render(text, marks)).toMatchSnapshot()
	})
})

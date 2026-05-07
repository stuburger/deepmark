import { describe, expect, it } from "vitest"
import { renderLegendDocument } from "../render"
import { META, stripStyles } from "./fixtures"

describe("renderLegendDocument", () => {
	it("renders all six mark signals + chain highlights with no AOs", () => {
		const html = renderLegendDocument({ meta: META, aoLabels: [] })
		// Mark signals
		expect(html).toContain("Tick")
		expect(html).toContain("Cross")
		expect(html).toContain("Underline")
		expect(html).toContain("Double underline")
		expect(html).toContain("Box")
		expect(html).toContain("Circle")
		// Chain highlights
		expect(html).toContain("Reasoning connective")
		expect(html).toContain("Evaluation connective")
		expect(html).toContain("Judgement indicator")
		// AO block omitted when no labels supplied
		expect(html).not.toContain("Assessment objectives")
	})

	it("renders the AO badges block when labels are supplied", () => {
		const html = renderLegendDocument({
			meta: META,
			aoLabels: ["AO1", "AO2", "AO3"],
		})
		expect(html).toContain("Assessment objectives")
		expect(html).toContain("AO1")
		expect(html).toContain("AO2")
		expect(html).toContain("AO3")
	})

	it("emits a doctype so Chromium renders in standards mode", () => {
		const html = renderLegendDocument({ meta: META, aoLabels: [] })
		expect(html.startsWith("<!doctype html>")).toBe(true)
	})

	it("matches a stable snapshot for the canonical legend (with AOs)", () => {
		const html = renderLegendDocument({
			meta: META,
			aoLabels: ["AO1", "AO2"],
		})
		expect(stripStyles(html)).toMatchSnapshot()
	})
})

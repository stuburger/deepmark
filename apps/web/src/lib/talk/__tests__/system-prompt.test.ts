import { describe, expect, it } from "vitest"
import { formatUserMessageWithSelection } from "../system-prompt"

describe("formatUserMessageWithSelection", () => {
	it("returns input unchanged when selection is null/undefined", () => {
		expect(formatUserMessageWithSelection("why is this wrong?", null)).toBe(
			"why is this wrong?",
		)
		expect(
			formatUserMessageWithSelection("why is this wrong?", undefined),
		).toBe("why is this wrong?")
	})

	it("returns input unchanged when selection text is blank", () => {
		expect(
			formatUserMessageWithSelection("hello", {
				text: "   ",
				questionNumber: "3",
			}),
		).toBe("hello")
	})

	it("wraps selection with question number when provided", () => {
		const out = formatUserMessageWithSelection("Explain.", {
			text: "Paris is the capital",
			questionNumber: "1a",
		})
		expect(out).toContain('<selection question="Q1a">')
		expect(out).toContain("Paris is the capital")
		expect(out).toContain("</selection>")
		expect(out.endsWith("Explain.")).toBe(true)
	})

	it("uses a bare tag when no question number is provided", () => {
		const out = formatUserMessageWithSelection("Why?", {
			text: "the student wrote this",
		})
		expect(out).toMatch(/^<selection>/)
		expect(out).toContain("the student wrote this")
		expect(out).toContain("</selection>")
		expect(out.endsWith("Why?")).toBe(true)
	})

	it("emits only the selection block when user input is empty", () => {
		const out = formatUserMessageWithSelection("   ", {
			text: "alone",
			questionNumber: "2",
		})
		expect(out).toBe('<selection question="Q2">\nalone\n</selection>')
	})

	it("includes questionId attribute when supplied", () => {
		const out = formatUserMessageWithSelection("Explain.", {
			text: "Paris",
			questionNumber: "1",
			questionId: "q-uuid-1",
		})
		expect(out).toContain('questionId="q-uuid-1"')
	})

	it("emits a bare <selection> tag when no machine handles are set", () => {
		const out = formatUserMessageWithSelection("Why?", {
			text: "Paris",
		})
		expect(out).toMatch(/^<selection>/)
		expect(out).not.toContain('question="')
		expect(out).not.toContain("questionId=")
	})
})

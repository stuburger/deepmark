import { describe, expect, it } from "vitest"
import { renderStudentDocument } from "../render"
import {
	META,
	mcqResult,
	stripStyles,
	student,
	writtenResult,
} from "./fixtures"

const NO_ANNOTATIONS = { annotations: [], pageTokens: [] }

describe("renderStudentDocument (unannotated)", () => {
	it("renders mixed MCQ + written results for a single student", () => {
		const html = renderStudentDocument({
			meta: META,
			...NO_ANNOTATIONS,
			student: student({
				submission_id: "s-1",
				student_name: "Pat Doe",
				total_awarded: 3,
				total_max: 5,
				grading_results: [
					mcqResult("1", "A", "A", 1),
					mcqResult("2", "B", "C", 0),
					writtenResult({ awarded_score: 2, max_score: 4 }),
				],
			}),
		})
		expect(stripStyles(html)).toMatchSnapshot()
	})

	it("includes the examiner summary when present", () => {
		const html = renderStudentDocument({
			meta: META,
			...NO_ANNOTATIONS,
			student: student({
				examiner_summary: "Strong on application. Watch the units.",
				grading_results: [writtenResult()],
			}),
		})
		expect(html).toContain("Examiner summary")
		expect(html).toContain("Strong on application. Watch the units.")
	})

	it("omits the MCQ table when there are no MCQ results", () => {
		const html = renderStudentDocument({
			meta: META,
			...NO_ANNOTATIONS,
			student: student({
				grading_results: [writtenResult()],
			}),
		})
		expect(html).not.toContain("Multiple choice questions")
	})

	it("renders WWW and EBI bullets when present", () => {
		const html = renderStudentDocument({
			meta: META,
			...NO_ANNOTATIONS,
			student: student({
				grading_results: [
					writtenResult({
						what_went_well: ["Clear structure"],
						even_better_if: ["Use specific examples"],
					}),
				],
			}),
		})
		expect(html).toContain("What went well")
		expect(html).toContain("Clear structure")
		expect(html).toContain("Even better if")
		expect(html).toContain("Use specific examples")
	})

	it("emits a doctype so Chromium renders in standards mode", () => {
		const html = renderStudentDocument({
			meta: META,
			...NO_ANNOTATIONS,
			student: student({ grading_results: [] }),
		})
		expect(html.startsWith("<!doctype html>")).toBe(true)
	})

	it("falls back to plain answer text when no annotations are provided", () => {
		const html = renderStudentDocument({
			meta: META,
			...NO_ANNOTATIONS,
			student: student({
				grading_results: [
					writtenResult({ student_answer: "A simple answer." }),
				],
			}),
		})
		// `.ao-label` is unique to AnnotatedAnswer's trailing-AO-label
		// `<span>`. The class string also appears inside the inlined `<style>`
		// block as a selector, so we check for the *attribute* form.
		expect(html).toContain('class="answer-text"')
		expect(html).not.toContain('class="ao-label"')
	})
})

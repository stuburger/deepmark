import { describe, expect, it } from "vitest"
import { renderCoverDocument } from "../render"
import {
	META,
	mcqResult,
	stripStyles,
	student,
	writtenResult,
} from "./fixtures"

describe("renderCoverDocument", () => {
	it("renders the class cover with summary table for a multi-student class", () => {
		const html = renderCoverDocument({
			meta: META,
			students: [
				student({
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
				student({
					submission_id: "s-2",
					student_name: "Jamie Roe",
					total_awarded: 4,
					total_max: 5,
					grading_results: [
						mcqResult("1", "A", "A", 1),
						mcqResult("2", "B", "B", 1),
						writtenResult({ awarded_score: 2, max_score: 4 }),
					],
				}),
			],
		})
		expect(stripStyles(html)).toMatchSnapshot()
	})

	it("emits a doctype so Chromium renders in standards mode", () => {
		const html = renderCoverDocument({
			meta: META,
			students: [student({})],
		})
		expect(html.startsWith("<!doctype html>")).toBe(true)
	})

	it("colour-classes percentages by band", () => {
		const html = renderCoverDocument({
			meta: META,
			students: [
				student({
					submission_id: "good",
					student_name: "High",
					total_awarded: 9,
					total_max: 10,
				}),
				student({
					submission_id: "warn",
					student_name: "Mid",
					total_awarded: 5,
					total_max: 10,
				}),
				student({
					submission_id: "bad",
					student_name: "Low",
					total_awarded: 2,
					total_max: 10,
				}),
			],
		})
		// Cover summary rows pick a colour class per percentage band.
		expect(html).toContain("score-good")
		expect(html).toContain("score-warn")
		expect(html).toContain("score-bad")
	})

	it("renders the Grade column when any student has grade boundaries", () => {
		const html = renderCoverDocument({
			meta: META,
			students: [
				student({
					submission_id: "graded",
					student_name: "Pat",
					total_awarded: 8,
					total_max: 10,
					grade_boundaries: [
						{ grade: "9", min_mark: 90 },
						{ grade: "8", min_mark: 70 },
					],
					grade_boundary_mode: "percent",
				}),
			],
		})
		expect(html).toContain(">Grade<")
	})
})

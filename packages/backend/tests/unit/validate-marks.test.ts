import { describe, expect, it } from "vitest"
import {
	type ValidateMarksInput,
	validateMarks,
	warningForQuestion,
} from "../../src/processors/question-paper-pdf/validate-marks"

function input(overrides: Partial<ValidateMarksInput>): ValidateMarksInput {
	return {
		sections: [],
		paper_printed_total_marks: null,
		...overrides,
	}
}

describe("validateMarks", () => {
	it("returns no discrepancies when everything matches", () => {
		const result = validateMarks(
			input({
				paper_printed_total_marks: 10,
				sections: [
					{
						title: "Section A",
						total_marks: 10,
						printed_total_marks: 10,
						questions: [
							{
								total_marks: 4,
								printed_marks: 4,
								question_number: "1",
							},
							{
								total_marks: 6,
								printed_marks: 6,
								question_number: "2",
							},
						],
					},
				],
			}),
		)
		expect(result).toEqual([])
	})

	it("returns no discrepancies when printed values are all null (no signal)", () => {
		const result = validateMarks(
			input({
				paper_printed_total_marks: null,
				sections: [
					{
						title: "Section A",
						total_marks: 999,
						printed_total_marks: null,
						questions: [
							{
								total_marks: 100,
								printed_marks: null,
								question_number: "1",
							},
						],
					},
				],
			}),
		)
		expect(result).toEqual([])
	})

	it("flags a per-question mismatch (the franchising bug)", () => {
		const result = validateMarks(
			input({
				sections: [
					{
						title: "Section A",
						total_marks: 35,
						printed_total_marks: null,
						questions: [
							{
								total_marks: 12,
								printed_marks: 2,
								question_number: "2",
							},
						],
					},
				],
			}),
		)
		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({
			scope: "question",
			section_index: 0,
			question_index: 0,
			expected: 2,
			found: 12,
		})
		expect(result[0]?.message).toContain("Question 2")
		expect(result[0]?.message).toContain("(2 marks)")
		expect(result[0]?.message).toContain("12")
	})

	it("flags a section subtotal mismatch", () => {
		const result = validateMarks(
			input({
				sections: [
					{
						title: "Section A",
						total_marks: 35,
						printed_total_marks: 25,
						questions: [
							{ total_marks: 12, printed_marks: null },
							{ total_marks: 13, printed_marks: null },
							{ total_marks: 10, printed_marks: null },
						],
					},
				],
			}),
		)
		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({
			scope: "section",
			section_index: 0,
			expected: 25,
			found: 35,
		})
		expect(result[0]?.message).toContain("Section A")
	})

	it("flags a paper-total mismatch", () => {
		const result = validateMarks(
			input({
				paper_printed_total_marks: 43,
				sections: [
					{
						title: "Section A",
						total_marks: 25,
						printed_total_marks: null,
						questions: [{ total_marks: 25, printed_marks: null }],
					},
					{
						title: "Section B",
						total_marks: 30,
						printed_total_marks: null,
						questions: [{ total_marks: 30, printed_marks: null }],
					},
				],
			}),
		)
		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({
			scope: "paper",
			expected: 43,
			found: 55,
		})
	})

	it("flags multiple discrepancies simultaneously", () => {
		const result = validateMarks(
			input({
				paper_printed_total_marks: 43,
				sections: [
					{
						title: "Section A",
						total_marks: 35,
						printed_total_marks: 25,
						questions: [
							{
								total_marks: 12,
								printed_marks: 2,
								question_number: "2",
							},
							{ total_marks: 23, printed_marks: null },
						],
					},
				],
			}),
		)
		expect(result).toHaveLength(3)
		const scopes = result.map((d) => d.scope)
		expect(scopes).toContain("question")
		expect(scopes).toContain("section")
		expect(scopes).toContain("paper")
	})

	it("uses index fallback when question_number is missing", () => {
		const result = validateMarks(
			input({
				sections: [
					{
						title: "Section A",
						total_marks: 5,
						printed_total_marks: null,
						questions: [
							{ total_marks: 5, printed_marks: 2 }, // mismatch, no question_number
						],
					},
				],
			}),
		)
		expect(result).toHaveLength(1)
		expect(result[0]?.message).toContain("Question #1")
	})
})

describe("warningForQuestion", () => {
	it("returns the per-question message when scoped to that exact position", () => {
		const discrepancies = validateMarks(
			input({
				sections: [
					{
						title: "Section A",
						total_marks: 12,
						printed_total_marks: null,
						questions: [
							{
								total_marks: 12,
								printed_marks: 2,
								question_number: "2",
							},
						],
					},
				],
			}),
		)
		expect(warningForQuestion(discrepancies, 0, 0)).toContain("Question 2")
		expect(warningForQuestion(discrepancies, 0, 1)).toBeNull()
	})

	it("attaches a section discrepancy to the first question of that section", () => {
		const discrepancies = validateMarks(
			input({
				sections: [
					{
						title: "Section A",
						total_marks: 35,
						printed_total_marks: 25,
						questions: [
							{ total_marks: 20, printed_marks: null },
							{ total_marks: 15, printed_marks: null },
						],
					},
				],
			}),
		)
		expect(warningForQuestion(discrepancies, 0, 0)).toContain("Section A")
		expect(warningForQuestion(discrepancies, 0, 1)).toBeNull()
	})

	it("attaches a paper-total discrepancy to the very first question", () => {
		const discrepancies = validateMarks(
			input({
				paper_printed_total_marks: 43,
				sections: [
					{
						title: "Section A",
						total_marks: 25,
						printed_total_marks: null,
						questions: [{ total_marks: 25, printed_marks: null }],
					},
					{
						title: "Section B",
						total_marks: 30,
						printed_total_marks: null,
						questions: [{ total_marks: 30, printed_marks: null }],
					},
				],
			}),
		)
		expect(warningForQuestion(discrepancies, 0, 0)).toContain("Paper total")
		expect(warningForQuestion(discrepancies, 1, 0)).toBeNull()
	})

	it("concatenates multiple warnings on the same row", () => {
		const discrepancies = validateMarks(
			input({
				paper_printed_total_marks: 43,
				sections: [
					{
						title: "Section A",
						total_marks: 35,
						printed_total_marks: 25,
						questions: [
							{
								total_marks: 12,
								printed_marks: 2,
								question_number: "2",
							},
						],
					},
				],
			}),
		)
		const warning = warningForQuestion(discrepancies, 0, 0)
		expect(warning).toContain("Question 2")
		expect(warning).toContain("Section A")
		expect(warning).toContain("Paper total")
	})
})

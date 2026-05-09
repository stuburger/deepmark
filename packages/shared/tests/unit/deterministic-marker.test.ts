import { describe, expect, it } from "vitest"
import { DeterministicMarker } from "../../src/marking/deterministic"
import type { QuestionWithMarkScheme } from "../../src/grading/types"

function mcq(correct: string[]): QuestionWithMarkScheme {
	return {
		id: "q1",
		questionType: "multiple_choice",
		questionText: "Which option?",
		topic: "test",
		rubric: "",
		totalPoints: 1,
		markPoints: [
			{
				pointNumber: 1,
				description: "Correct option",
				points: 1,
				criteria: "Selects correct option",
				isRequired: true,
			},
		],
		correctOptionLabels: correct,
		availableOptions: [
			{ optionLabel: "A", optionText: "First" },
			{ optionLabel: "B", optionText: "Second" },
			{ optionLabel: "C", optionText: "Third" },
			{ optionLabel: "D", optionText: "Fourth" },
		],
	}
}

describe("DeterministicMarker", () => {
	const marker = new DeterministicMarker()

	it("awards full marks for an exact letter match", async () => {
		const result = await marker.mark(mcq(["D"]), "D")
		expect(result.totalScore).toBe(1)
	})

	it("ignores trailing option text leaked from attribution", async () => {
		const result = await marker.mark(
			mcq(["D"]),
			"D Allows the customisation of products",
		)
		expect(result.totalScore).toBe(1)
		expect(result.correctAnswer).toBe("D")
	})

	it("ignores leaked option text containing mixed-case acronyms", async () => {
		const result = await marker.mark(mcq(["C"]), "C Plc and Ltd")
		expect(result.totalScore).toBe(1)
	})

	it("treats joined multi-select labels as separate selections", async () => {
		const result = await marker.mark(mcq(["A", "B"]), "AB")
		expect(result.totalScore).toBe(1)
	})

	it("zeroes wrong answers, even with trailing text", async () => {
		const result = await marker.mark(
			mcq(["D"]),
			"B Partnerships and sole traders",
		)
		expect(result.totalScore).toBe(0)
	})

	it("zeroes empty answers", async () => {
		const result = await marker.mark(mcq(["D"]), "")
		expect(result.totalScore).toBe(0)
	})

	it("is case-insensitive", async () => {
		const result = await marker.mark(mcq(["D"]), "d")
		expect(result.totalScore).toBe(1)
	})
})

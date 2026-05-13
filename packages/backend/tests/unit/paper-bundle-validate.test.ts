import { describe, expect, it } from "vitest"
import type { PaperBundle } from "../../src/processors/paper-bundle/schema"
import { validateBundle } from "../../src/processors/paper-bundle/validate"

function baseBundle(): PaperBundle {
	return {
		metadata: {
			title: "AQA Test Paper",
			subject: "business",
			exam_board: "AQA",
			total_marks: 25,
			printed_total_marks: 25,
			duration_minutes: 60,
			year: 2024,
			paper_number: 1,
			tier: null,
		},
		sections: [
			{
				title: "Section 1",
				description: null,
				total_marks: 25,
				printed_total_marks: null,
				stimuli: [],
				questions: [
					{
						question_text: "Define a business.",
						question_type: "written",
						total_marks: 1,
						printed_marks: 1,
						question_number: "1",
						stimulus_labels: [],
						options: null,
						mark_scheme: {
							marking_method: "point_based",
							mark_points: [{ criteria: "Any reasonable definition." }],
							acceptable_answers: [],
							guidance: null,
							correct_option: null,
							ao_allocations: null,
							levels: null,
							caps: null,
							content: null,
						},
					},
				],
			},
		],
	}
}

describe("validateBundle", () => {
	it("accepts a fully-formed bundle", () => {
		expect(validateBundle(baseBundle())).toEqual({ ok: true })
	})

	it("rejects an empty sections array", () => {
		const b = baseBundle()
		b.sections = []
		expect(validateBundle(b)).toEqual({
			ok: false,
			error: "Bundle returned zero sections",
		})
	})

	it("rejects a section with no questions", () => {
		const b = baseBundle()
		b.sections[0]!.questions = []
		const r = validateBundle(b)
		expect(r.ok).toBe(false)
	})

	it("rejects point_based with empty mark_points", () => {
		const b = baseBundle()
		b.sections[0]!.questions[0]!.mark_scheme.mark_points = []
		const r = validateBundle(b)
		expect(r.ok).toBe(false)
		if (!r.ok) expect(r.error).toMatch(/Point-based/)
	})

	it("rejects level_of_response with no levels", () => {
		const b = baseBundle()
		const ms = b.sections[0]!.questions[0]!.mark_scheme
		ms.marking_method = "level_of_response"
		ms.mark_points = []
		ms.levels = null
		const r = validateBundle(b)
		expect(r.ok).toBe(false)
		if (!r.ok) expect(r.error).toMatch(/Level-of-response/)
	})

	it("rejects deterministic without correct_option", () => {
		const b = baseBundle()
		const ms = b.sections[0]!.questions[0]!.mark_scheme
		ms.marking_method = "deterministic"
		ms.mark_points = []
		ms.correct_option = null
		const r = validateBundle(b)
		expect(r.ok).toBe(false)
		if (!r.ok) expect(r.error).toMatch(/Deterministic/)
	})
})

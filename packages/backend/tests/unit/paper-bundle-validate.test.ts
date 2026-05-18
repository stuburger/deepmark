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
							lor_extraction: null,
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

	it("rejects level_of_response with no lor_extraction", () => {
		const b = baseBundle()
		const q = b.sections[0]!.questions[0]!
		q.total_marks = 24
		q.mark_scheme.marking_method = "level_of_response"
		q.mark_scheme.mark_points = []
		q.mark_scheme.lor_extraction = null
		const r = validateBundle(b)
		expect(r.ok).toBe(false)
		if (!r.ok) expect(r.error).toMatch(/no lor_extraction/)
	})

	it("rejects level_of_response with empty ao_dimensions", () => {
		const b = baseBundle()
		const q = b.sections[0]!.questions[0]!
		q.total_marks = 24
		q.mark_scheme.marking_method = "level_of_response"
		q.mark_scheme.mark_points = []
		q.mark_scheme.lor_extraction = {
			indicative_content: "",
			ao_dimensions: [],
			marker_notes: null,
			extras: null,
		}
		const r = validateBundle(b)
		expect(r.ok).toBe(false)
		if (!r.ok) expect(r.error).toMatch(/no ao_dimensions/)
	})

	it("rejects level_of_response when a dimension has no levels", () => {
		const b = baseBundle()
		const q = b.sections[0]!.questions[0]!
		q.total_marks = 24
		q.mark_scheme.marking_method = "level_of_response"
		q.mark_scheme.mark_points = []
		q.mark_scheme.lor_extraction = {
			indicative_content: "",
			ao_dimensions: [
				{ ao_code: "AO5", marks: 24, description: "", levels: [] },
			],
			marker_notes: null,
			extras: null,
		}
		const r = validateBundle(b)
		expect(r.ok).toBe(false)
		if (!r.ok) expect(r.error).toMatch(/has no levels/)
	})

	it("rejects level_of_response when dimension marks don't sum to total", () => {
		const b = baseBundle()
		const q = b.sections[0]!.questions[0]!
		q.total_marks = 40
		q.mark_scheme.marking_method = "level_of_response"
		q.mark_scheme.mark_points = []
		q.mark_scheme.lor_extraction = {
			indicative_content: "",
			ao_dimensions: [
				{
					ao_code: "AO5",
					marks: 24,
					description: "Content",
					levels: [
						{
							level: 1,
							mark_range: [1, 6],
							descriptor_bullets: ["Basic"],
						},
					],
				},
				// Missing AO6 — only sums to 24, not 40.
			],
			marker_notes: null,
			extras: null,
		}
		const r = validateBundle(b)
		expect(r.ok).toBe(false)
		if (!r.ok)
			expect(r.error).toMatch(/sum to 24 but question total_marks is 40/)
	})

	it("accepts multi-skill level_of_response with parallel AO grids", () => {
		const b = baseBundle()
		const q = b.sections[0]!.questions[0]!
		q.total_marks = 40
		q.mark_scheme.marking_method = "level_of_response"
		q.mark_scheme.mark_points = []
		q.mark_scheme.ao_allocations = [
			{ ao_code: "AO5", marks: 24 },
			{ ao_code: "AO6", marks: 16 },
		]
		q.mark_scheme.lor_extraction = {
			indicative_content: "Write a story.",
			ao_dimensions: [
				{
					ao_code: "AO5",
					marks: 24,
					description: "Content / structure / register",
					levels: [
						{
							level: 1,
							mark_range: [1, 6],
							descriptor_bullets: ["Basic content"],
						},
					],
				},
				{
					ao_code: "AO6",
					marks: 16,
					description: "Vocabulary / SPaG",
					levels: [
						{
							level: 1,
							mark_range: [1, 4],
							descriptor_bullets: ["Basic vocabulary"],
						},
					],
				},
			],
			marker_notes: null,
			extras: null,
		}
		expect(validateBundle(b)).toEqual({ ok: true })
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

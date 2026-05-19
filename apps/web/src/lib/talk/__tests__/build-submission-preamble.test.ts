import type {
	GradingResult,
	StudentPaperAnnotation,
	StudentPaperJobPayload,
} from "@/lib/marking/types"
import { describe, expect, it } from "vitest"
import { buildSubmissionPreamble } from "../build-submission-preamble"

function makeResult(overrides: Partial<GradingResult> = {}): GradingResult {
	return {
		question_id: "q1",
		question_text: "What is the capital of France?",
		question_number: "1",
		student_answer: "Paris",
		awarded_score: 1,
		max_score: 1,
		llm_reasoning: "",
		feedback_summary: "Correct.",
		marking_method: "deterministic",
		...overrides,
	}
}

function makePayload(
	overrides: Partial<StudentPaperJobPayload> = {},
): StudentPaperJobPayload {
	return {
		status: "complete",
		error: null,
		student_name: "Aaron Brown",
		student_id: "student-1",
		detected_student_number: null,
		detected_subject: null,
		pages_count: 2,
		grading_results: [],
		exam_paper_title: "Edexcel English Lang Paper 1",
		exam_paper_id: "paper-1",
		total_awarded: 0,
		total_max: 0,
		created_at: new Date("2026-05-10T10:00:00Z"),
		confirmed_at: null,
		is_bookmarked: false,
		extracted_answers: null,
		job_events: null,
		annotation_status: "complete",
		level_descriptors: null,
		tier: null,
		grade_boundaries: null,
		grade_boundary_mode: null,
		submission_id: "sub-1",
		...overrides,
	}
}

function makeAnnotation(
	overrides: Partial<StudentPaperAnnotation> = {},
): StudentPaperAnnotation {
	return {
		id: "ann-1",
		grading_run_id: null,
		question_id: "q1",
		page_order: 0,
		overlay_type: "annotation",
		sentiment: "positive",
		source: "teacher",
		bbox: [0, 0, 100, 100],
		anchor_token_start_id: "tok-1",
		anchor_token_end_id: "tok-3",
		payload: {
			_v: 1,
			signal: "tick",
			reason: "Good use of evidence.",
		},
		...overrides,
	} as StudentPaperAnnotation
}

describe("buildSubmissionPreamble", () => {
	it("is byte-stable across repeated calls with the same input", () => {
		const payload = makePayload({
			grading_results: [
				makeResult({ question_id: "q1", question_number: "1" }),
				makeResult({
					question_id: "q2",
					question_number: "2",
					marking_method: "point_based",
					student_answer: "Two-mark answer.",
					awarded_score: 2,
					max_score: 2,
					mark_points_results: [
						{
							pointNumber: 2,
							awarded: true,
							reasoning: "Mentioned osmosis.",
							expectedCriteria: "Osmosis identified.",
							studentCovered: "osmosis",
						},
						{
							pointNumber: 1,
							awarded: true,
							reasoning: "Identified water.",
							expectedCriteria: "Water mentioned.",
							studentCovered: "water moves",
						},
					],
				}),
			],
			total_awarded: 3,
			total_max: 3,
		})
		const annotations = [
			makeAnnotation({ id: "ann-a", question_id: "q1" }),
			makeAnnotation({ id: "ann-b", question_id: "q2" }),
		]

		const a = buildSubmissionPreamble({ payload, annotations })
		const b = buildSubmissionPreamble({ payload, annotations })
		expect(a).toBe(b)
	})

	it("includes every question's heading", () => {
		const payload = makePayload({
			grading_results: [
				makeResult({ question_id: "q1", question_number: "1" }),
				makeResult({ question_id: "q2", question_number: "2a" }),
				makeResult({ question_id: "q3", question_number: "10" }),
			],
		})
		const out = buildSubmissionPreamble({ payload, annotations: [] })
		expect(out).toMatch(/^### Q1 /m)
		expect(out).toMatch(/^### Q2a /m)
		expect(out).toMatch(/^### Q10 /m)
	})

	it("attributes annotations to their question", () => {
		const payload = makePayload({
			grading_results: [
				makeResult({ question_id: "q1", question_number: "1" }),
				makeResult({ question_id: "q2", question_number: "2" }),
			],
		})
		const annotations = [
			makeAnnotation({ id: "ann-on-q1", question_id: "q1" }),
			makeAnnotation({ id: "ann-on-q2", question_id: "q2" }),
		]
		const out = buildSubmissionPreamble({ payload, annotations })

		const q1Idx = out.indexOf("### Q1 ")
		const q2Idx = out.indexOf("### Q2 ")
		const annQ1Idx = out.indexOf("ann-on-q1")
		const annQ2Idx = out.indexOf("ann-on-q2")

		expect(annQ1Idx).toBeGreaterThan(q1Idx)
		expect(annQ1Idx).toBeLessThan(q2Idx)
		expect(annQ2Idx).toBeGreaterThan(q2Idx)
	})

	it("sorts mark points by pointNumber even when input is unordered", () => {
		const payload = makePayload({
			grading_results: [
				makeResult({
					question_id: "q1",
					question_number: "1",
					marking_method: "point_based",
					mark_points_results: [
						{
							pointNumber: 3,
							awarded: false,
							reasoning: "Missing conclusion.",
							expectedCriteria: "Concludes argument.",
							studentCovered: "no conclusion offered",
						},
						{
							pointNumber: 1,
							awarded: true,
							reasoning: "States position.",
							expectedCriteria: "Clear stance.",
							studentCovered: "I agree",
						},
						{
							pointNumber: 2,
							awarded: true,
							reasoning: "Gives reason.",
							expectedCriteria: "Reasoned justification.",
							studentCovered: "because",
						},
					],
				}),
			],
		})
		const out = buildSubmissionPreamble({ payload, annotations: [] })
		const idx1 = out.indexOf("MP1 ")
		const idx2 = out.indexOf("MP2 ")
		const idx3 = out.indexOf("MP3 ")
		expect(idx1).toBeGreaterThan(-1)
		expect(idx1).toBeLessThan(idx2)
		expect(idx2).toBeLessThan(idx3)
	})

	it("renders LoR AO awards with descriptor evaluations", () => {
		const payload = makePayload({
			grading_results: [
				makeResult({
					question_id: "q1",
					question_number: "5",
					marking_method: "level_of_response",
					awarded_score: 8,
					max_score: 12,
					level_awarded: 3,
					why_not_next_level: "Lacks sustained evaluation.",
					cap_applied: "No cap",
					ao_awards: [
						{
							ao_code: "AO2",
							level_awarded: 3,
							awarded_marks: 8,
							max_marks: 12,
							why_not_next_level: "Analysis not consistent.",
							descriptor_evaluations: [
								{
									descriptor: "Analyses language choices in detail.",
									met: true,
									evidence: "Discusses 'dazzling' as showing wonder.",
								},
								{
									descriptor: "Evaluates structural choices throughout.",
									met: false,
									evidence: "Structure mentioned but not evaluated.",
								},
							],
						},
					],
				}),
			],
		})
		const out = buildSubmissionPreamble({ payload, annotations: [] })
		expect(out).toContain("AO awards")
		expect(out).toContain("AO2: Level 3, 8/12")
		expect(out).toContain("[MET] Analyses language choices in detail.")
		expect(out).toContain("[NOT MET] Evaluates structural choices throughout.")
		expect(out).toContain("**Level awarded:** 3")
		expect(out).toContain("**Cap applied:** No cap")
	})

	it("marks results excluded by choice-aware sections", () => {
		const payload = makePayload({
			grading_results: [
				makeResult({
					question_id: "q5",
					question_number: "5",
					included_in_total: false,
				}),
				makeResult({
					question_id: "q6",
					question_number: "6",
					included_in_total: true,
				}),
			],
		})
		const out = buildSubmissionPreamble({ payload, annotations: [] })
		const q5Heading = out.split("\n").find((l) => l.startsWith("### Q5 "))
		const q6Heading = out.split("\n").find((l) => l.startsWith("### Q6 "))
		expect(q5Heading).toContain("excluded")
		expect(q6Heading).not.toContain("excluded")
	})

	it("renders chain annotations distinctly from signal annotations", () => {
		const payload = makePayload({
			grading_results: [
				makeResult({ question_id: "q1", question_number: "1" }),
			],
		})
		const annotations: StudentPaperAnnotation[] = [
			{
				id: "chain-1",
				grading_run_id: null,
				question_id: "q1",
				page_order: 0,
				overlay_type: "chain",
				sentiment: null,
				source: "ai",
				bbox: [0, 0, 100, 100],
				anchor_token_start_id: "tok-1",
				anchor_token_end_id: "tok-5",
				payload: {
					_v: 1,
					chainType: "reasoning",
					phrase: "because of this",
				},
			},
		]
		const out = buildSubmissionPreamble({ payload, annotations })
		expect(out).toContain("chain=reasoning")
		expect(out).toContain('phrase="because of this"')
	})

	it("handles empty grading_results gracefully", () => {
		const out = buildSubmissionPreamble({
			payload: makePayload(),
			annotations: [],
		})
		expect(out).toContain("No grading results available yet.")
	})
})

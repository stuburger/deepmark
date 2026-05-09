import type { GradingResult } from "@mcp-gcse/shared"
import type { StudentPaperResultPayload } from "../../../types"
import type { ClassExportMeta } from "../../types"

// Minimal hand-crafted payloads. The shapes mirror the real `toJobPayload`
// output but only carry the fields the print components actually read.

export function mcqResult(
	number: string,
	correct: string,
	chosen: string,
	awarded: number,
): GradingResult {
	return {
		question_id: `mcq-${number}`,
		question_number: number,
		question_text: `MCQ question ${number}`,
		student_answer: chosen,
		awarded_score: awarded,
		max_score: 1,
		llm_reasoning: "",
		feedback_summary: "",
		marking_method: "deterministic",
		correct_option_labels: [correct],
	}
}

export function writtenResult(
	overrides: Partial<GradingResult> = {},
): GradingResult {
	return {
		question_id: "w-1",
		question_number: "3",
		question_text: "Explain how X causes Y.",
		student_answer: "Because reasons.",
		awarded_score: 2,
		max_score: 4,
		llm_reasoning: "",
		feedback_summary: "",
		marking_method: "point_based",
		what_went_well: ["Identified the cause"],
		even_better_if: ["Develop the reasoning further"],
		...overrides,
	}
}

export function student(
	overrides: Partial<StudentPaperResultPayload> = {},
): StudentPaperResultPayload {
	return {
		status: "complete",
		error: null,
		student_name: "Pat Doe",
		student_id: null,
		detected_student_number: null,
		detected_subject: null,
		pages_count: 2,
		grading_results: [],
		exam_paper_title: "GCSE Maths Paper 1",
		exam_paper_id: "p-1",
		total_awarded: 0,
		total_max: 0,
		created_at: new Date("2026-05-07T10:00:00Z"),
		confirmed_at: null,
		is_bookmarked: false,
		extracted_answers: null,
		job_events: null,
		annotation_status: null,
		level_descriptors: null,
		tier: null,
		grade_boundaries: null,
		grade_boundary_mode: null,
		submission_id: "s-1",
		examiner_summary: null,
		...overrides,
	}
}

export const META: ClassExportMeta = {
	className: "Year 10 Set 2",
	teacherName: "Mx Bourhill",
	paperTitle: "GCSE Maths Paper 1",
	generatedAt: new Date("2026-05-07T10:00:00Z"),
	printLayout: "duplex",
}

/**
 * Strip the inlined `<style>` block from a rendered HTML document.
 * Snapshot assertions use this so a print-stylesheet edit doesn't churn
 * every snapshot in the suite — CSS regressions are caught by the
 * Chromium smoke test (packages/backend/tests/unit/pdf-renderer/
 * smoke.test.ts), not these structural assertions.
 */
export function stripStyles(html: string): string {
	return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
}

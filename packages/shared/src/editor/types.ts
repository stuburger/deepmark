import type { AnnotationPayload, ChainPayload } from "../annotation/types"

/**
 * Editor-side data types — used by build-doc, derive-annotations, and the
 * alignment helpers. These live here (rather than in apps/web) so the same
 * code can run inside a Lambda / projection handler without crossing a
 * package boundary.
 *
 * Web's lib/marking/types.ts re-exports these alongside its UI-only types.
 */

/** A word-level token from Cloud Vision Document Text Detection. */
export type PageToken = {
	id: string
	page_order: number
	para_index: number
	line_index: number
	word_index: number
	text_raw: string
	text_corrected: string | null
	/** [yMin, xMin, yMax, xMax] normalised 0–1000 */
	bbox: [number, number, number, number]
	confidence: number | null
	question_id: string | null
	answer_char_start: number | null
	answer_char_end: number | null
}

export type MarkPointResult = {
	pointNumber: number
	awarded: boolean
	reasoning: string
	expectedCriteria: string
	studentCovered: string
}

export type AnswerRegion = {
	page: number
	box: [number, number, number, number]
	source: string | null
}

export type McqOption = {
	option_label: string
	option_text: string
}

export type ResultStimulus = {
	label: string
	content: string
	content_type: "text" | "image" | "table"
}

export type GradingResult = {
	question_id: string
	question_text: string
	question_number: string
	student_answer: string
	awarded_score: number
	max_score: number
	llm_reasoning: string
	feedback_summary: string
	marking_method: "deterministic" | "point_based" | "level_of_response" | null
	level_awarded?: number
	what_went_well?: string[]
	even_better_if?: string[]
	answer_regions?: AnswerRegion[]
	multiple_choice_options?: McqOption[]
	correct_option_labels?: string[]
	mark_points_results?: MarkPointResult[]
	stimuli?: ResultStimulus[]
	/// Mark scheme used during grading. Carried on the doc's `markSchemeId`
	/// node attr; surfaced here so the projection Lambda can write Answer +
	/// MarkingResult rows without an extra DB lookup. Null for questions
	/// graded without a mark scheme (skipped by the row projection).
	mark_scheme_id?: string | null
	/// Why_not_next_level field surfaced from level_of_response grading.
	why_not_next_level?: string | null
	/// Cap descriptor surfaced from level_of_response grading.
	cap_applied?: string | null
}

export type ExtractedAnswer = {
	question_number: string
	answer_text: string
}

export type ExamPaperQuestion = {
	question_id: string
	question_number: string
	question_text: string
	max_score: number
	marking_method: "deterministic" | "point_based" | null
	multiple_choice_options: McqOption[]
	correct_option_labels: string[]
}

type AnnotationBase = {
	id: string
	grading_run_id: string | null
	question_id: string
	page_order: number
	sentiment: string | null
	/** Origin of the annotation — "ai" for Lambda-applied marks, "teacher" for teacher edits. */
	source: "ai" | "teacher"
	bbox: [number, number, number, number]
	anchor_token_start_id: string | null
	anchor_token_end_id: string | null
}

export type StudentPaperAnnotation =
	| (AnnotationBase & {
			overlay_type: "annotation"
			payload: AnnotationPayload
	  })
	| (AnnotationBase & { overlay_type: "chain"; payload: ChainPayload })

// ── List view ───────────────────────────────────────────────────────────────

export type ExamPaperListItem = {
	id: string
	title: string
	subject: string
	exam_board: string | null
	year: number
	paper_number: number | null
	total_marks: number
	duration_minutes: number
	is_active: boolean
	created_at: Date
	_count: {
		sections: number
		pdf_ingestion_jobs: number
	}
}

// ── Detail view ─────────────────────────────────────────────────────────────

export type ExamPaperQuestionStimulus = {
	id: string
	label: string
	content: string
	content_type: "text" | "image" | "table"
}

export type ExamPaperQuestion = {
	id: string
	text: string
	question_type: string
	points: number | null
	origin: string
	mark_scheme_count: number
	mark_scheme_status: string | null
	mark_scheme_id: string | null
	mark_scheme_description: string | null
	mark_scheme_correct_option_labels: string[]
	mark_scheme_points_total: number | null
	order: number
	question_number: string | null
	multiple_choice_options: { option_label: string; option_text: string }[]
	/** Stimuli referenced by this question, in display order. Empty when the question is standalone. */
	stimuli: ExamPaperQuestionStimulus[]
}

export type ExamPaperSection = {
	id: string
	title: string
	questions: ExamPaperQuestion[]
}

import type { BoundaryMode, GradeBoundary } from "@mcp-gcse/shared"

export type ExamPaperDetail = {
	id: string
	title: string
	subject: string
	exam_board: string | null
	year: number
	paper_number: number | null
	total_marks: number
	duration_minutes: number
	is_active: boolean
	created_at: Date
	sections: ExamPaperSection[]
	section_count: number
	level_descriptors: string | null
	tier: "foundation" | "higher" | null
	grade_boundaries: GradeBoundary[] | null
	grade_boundary_mode: BoundaryMode | null
}

// ── Catalog ─────────────────────────────────────────────────────────────────

export type CatalogExamPaper = {
	id: string
	title: string
	subject: string
	exam_board: string | null
	year: number
	paper_number: number | null
	total_marks: number
	question_count: number
	has_mark_scheme: boolean
}

// ── Unlinked mark schemes ───────────────────────────────────────────────────

export type UnlinkedMarkScheme = {
	markSchemeId: string
	markSchemeDescription: string | null
	pointsTotal: number
	ghostQuestionId: string
	ghostQuestionText: string
	ghostQuestionNumber: string | null
}

// ── Similarity ──────────────────────────────────────────────────────────────

export type SimilarPair = {
	questionId: string
	similarToId: string
	distance: number
}

// ── Question detail ─────────────────────────────────────────────────────────

export type QuestionMarkScheme = {
	id: string
	description: string | null
	guidance: string | null
	points_total: number
	marking_method: string
	mark_points: unknown
	content: string
	link_status: string
	correct_option_labels: string[]
}

export type MultipleChoiceOption = {
	option_label: string
	option_text: string
}

export type QuestionDetail = {
	id: string
	text: string
	question_type: string
	origin: string
	topic: string
	subject: string
	points: number | null
	question_number: string | null
	created_at: Date
	source_pdf_ingestion_job_id: string | null
	multiple_choice_options: MultipleChoiceOption[]
	mark_schemes: QuestionMarkScheme[]
}

export type UpdateQuestionInput = {
	text?: string
	points?: number | null
	question_number?: string | null
}

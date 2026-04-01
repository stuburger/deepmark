import type { JobEvent } from "@mcp-gcse/db"

export type { PageToken } from "@/lib/handwriting-types"

export type AnswerRegion = {
	/** 1-indexed page order matching the job's pages array */
	page: number
	/** [yMin, xMin, yMax, xMax] normalised 0–1000 */
	box: [number, number, number, number]
	/** null = precise Vision token hull; "gemini_fallback" = Gemini Vision estimate */
	source: string | null
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
	level_awarded?: number
	/** Spatial regions on the scan where this answer was written. Empty for older jobs. */
	answer_regions?: AnswerRegion[]
}

export type CreateStudentPaperJobResult =
	| { ok: true; jobId: string }
	| { ok: false; error: string }

export type AddPageToJobResult =
	| { ok: true; uploadUrl: string; key: string }
	| { ok: false; error: string }

export type RemovePageFromJobResult =
	| { ok: true }
	| { ok: false; error: string }

export type ReorderPagesResult = { ok: true } | { ok: false; error: string }

export type TriggerOcrResult = { ok: true } | { ok: false; error: string }

export type TriggerGradingResult = { ok: true } | { ok: false; error: string }

export type ExtractedAnswer = {
	question_number: string
	answer_text: string
}

export type StudentPaperJobPayload = {
	status: string
	error: string | null
	student_name: string | null
	student_id: string | null
	detected_subject: string | null
	pages_count: number
	grading_results: GradingResult[]
	exam_paper_title: string | null
	exam_paper_id: string
	total_awarded: number
	total_max: number
	created_at: Date
	extracted_answers: ExtractedAnswer[] | null
	job_events: JobEvent[] | null
}

export type GetStudentPaperJobResult =
	| { ok: true; data: StudentPaperJobPayload }
	| { ok: false; error: string }

export type StudentPaperResultPayload = StudentPaperJobPayload

export type UpdateStudentNameResult =
	| { ok: true }
	| { ok: false; error: string }

import type { HandwritingAnalysis } from "@/lib/handwriting-types"

export type ScanPageUrl = {
	order: number
	url: string
	mimeType: string
	/** Per-page OCR analysis (transcript + observations). Present for jobs
	 *  processed after the OCR pipeline was added; absent for older jobs. */
	analysis?: HandwritingAnalysis
}

export type GetJobScanPageUrlsResult =
	| { ok: true; pages: ScanPageUrl[] }
	| { ok: false; error: string }

export type GetJobPageTokensResult =
	| { ok: true; tokens: import("@/lib/handwriting-types").PageToken[] }
	| { ok: false; error: string }

export type LinkStudentToJobResult = { ok: true } | { ok: false; error: string }

export type SubmissionHistoryItem = {
	id: string
	student_name: string | null
	exam_paper_id: string | null
	exam_paper_title: string | null
	detected_subject: string | null
	total_awarded: number
	total_max: number
	status: string
	created_at: Date
}

export type ListMySubmissionsResult =
	| { ok: true; submissions: SubmissionHistoryItem[] }
	| { ok: false; error: string }

export type DeleteStudentPaperJobResult =
	| { ok: true }
	| { ok: false; error: string }

export type UpdateExtractedAnswerResult =
	| { ok: true }
	| { ok: false; error: string }

export type RetriggerGradingResult = { ok: true } | { ok: false; error: string }

export type RetriggerOcrResult = { ok: true } | { ok: false; error: string }

export type QuestionStat = {
	question_id: string
	question_text: string
	question_number: string
	max_score: number
	avg_awarded: number
	avg_percent: number
	submission_count: number
}

export type ExamPaperStats = {
	exam_paper_id: string
	exam_paper_title: string
	submission_count: number
	avg_total_percent: number
	question_stats: QuestionStat[]
}

export type GetExamPaperStatsResult =
	| { ok: true; stats: ExamPaperStats }
	| { ok: false; error: string }

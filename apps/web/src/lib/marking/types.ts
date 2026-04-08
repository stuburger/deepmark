import type { EnrichmentStatus, JobEvent } from "@mcp-gcse/db"
import type {
	AnnotationPayload as SharedAnnotationPayload,
	ChainPayload as SharedChainPayload,
	CommentPayload as SharedCommentPayload,
	MarkPayload as SharedMarkPayload,
	OverlayType as SharedOverlayType,
	TagPayload as SharedTagPayload,
} from "@mcp-gcse/shared"

/** Per-page OCR result from the Gemini transcript call. */
export type HandwritingAnalysis = {
	transcript: string
	observations: string[]
}

/**
 * A word-level token from Cloud Vision Document Text Detection,
 * stored in `student_paper_page_tokens` and returned by `getJobPageTokens`.
 */
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
}

export type MarkPointResult = {
	pointNumber: number
	awarded: boolean
	reasoning: string
	expectedCriteria: string
	studentCovered: string
}

/** Shape used by GradedScanViewer / layout helpers. */
export type GradedAnswerOnPage = {
	extractedAnswerId: string
	questionId: string
	questionPartId: string | null
	questionText: string
	questionNumber: string
	extractedText: string
	awardedScore: number
	maxScore: number
	feedbackSummary: string
	llmReasoning: string
	levelAwarded?: number
	markPointResults: MarkPointResult[]
	answerRegion: [number, number, number, number] | null
	isContinuation: boolean
}

export type GradedPage = {
	pageNumber: number
	imageUrl: string
	gradedAnswers: GradedAnswerOnPage[]
}

export type AnswerRegion = {
	/** 1-indexed page order matching the job's pages array */
	page: number
	/** [yMin, xMin, yMax, xMax] normalised 0–1000 */
	box: [number, number, number, number]
	/** null = precise Vision token hull; "gemini_fallback" = Gemini Vision estimate */
	source: string | null
}

// ─── Annotation types (re-exported from @mcp-gcse/shared) ───────────────────

export type OverlayType = SharedOverlayType
export type MarkPayload = SharedMarkPayload
export type TagPayload = SharedTagPayload
export type CommentPayload = SharedCommentPayload
export type ChainPayload = SharedChainPayload
export type AnnotationPayload = SharedAnnotationPayload

export type StudentPaperAnnotation = {
	id: string
	enrichment_run_id: string
	question_id: string
	page_order: number
	overlay_type: OverlayType
	sentiment: string | null
	payload: AnnotationPayload
	bbox: [number, number, number, number]
	parent_annotation_id: string | null
}

export type GetJobAnnotationsResult =
	| { ok: true; annotations: StudentPaperAnnotation[] }
	| { ok: false; error: string }

export type TriggerEnrichmentResult =
	| { ok: true }
	| { ok: false; error: string }

// ─── Grading types ───────────────────────────────────────────────────────────

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
	/** Spatial regions on the scan where this answer was written. Empty for older jobs. */
	answer_regions?: AnswerRegion[]
}

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
	enrichment_status: EnrichmentStatus | null
	level_descriptors: string | null
	/** Phase 3: IDs of the current domain model run records. Present for jobs processed after the Phase 3 migration. */
	submission_id?: string
	ocr_run_id?: string
	grading_run_id?: string
	enrichment_run_id?: string
}

export type GetStudentPaperJobResult =
	| { ok: true; data: StudentPaperJobPayload }
	| { ok: false; error: string }

export type StudentPaperResultPayload = StudentPaperJobPayload

export type UpdateStudentNameResult =
	| { ok: true }
	| { ok: false; error: string }

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
	| { ok: true; tokens: PageToken[] }
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

export type DeleteSubmissionResult = { ok: true } | { ok: false; error: string }

export type UpdateExtractedAnswerResult =
	| { ok: true }
	| { ok: false; error: string }

export type RetriggerGradingResult =
	| { ok: true; newJobId: string }
	| { ok: false; error: string }

export type RetriggerOcrResult =
	| { ok: true; newJobId: string }
	| { ok: false; error: string }

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

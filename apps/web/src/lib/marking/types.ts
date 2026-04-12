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
	/** Which question this token was attributed to (null for unattributed tokens). */
	question_id: string | null
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

/** Shared fields present on every annotation variant. */
type AnnotationBase = {
	id: string
	enrichment_run_id: string
	question_id: string
	page_order: number
	sentiment: string | null
	bbox: [number, number, number, number]
	parent_annotation_id: string | null
	/** FK to the first token in this annotation's span (null for older enrichment runs). */
	anchor_token_start_id: string | null
	/** FK to the last token in this annotation's span (null for older enrichment runs). */
	anchor_token_end_id: string | null
}

/**
 * Discriminated union on `overlay_type`.
 * Checking `a.overlay_type === "mark"` narrows `a.payload` to `MarkPayload`.
 */
export type StudentPaperAnnotation =
	| (AnnotationBase & { overlay_type: "mark"; payload: MarkPayload })
	| (AnnotationBase & { overlay_type: "tag"; payload: TagPayload })
	| (AnnotationBase & { overlay_type: "comment"; payload: CommentPayload })
	| (AnnotationBase & { overlay_type: "chain"; payload: ChainPayload })

export type GetJobAnnotationsResult =
	| { ok: true; annotations: StudentPaperAnnotation[] }
	| { ok: false; error: string }

export type TriggerEnrichmentResult =
	| { ok: true }
	| { ok: false; error: string }

// ─── Grading types ───────────────────────────────────────────────────────────

export type McqOption = {
	option_label: string
	option_text: string
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
	/** Spatial regions on the scan where this answer was written. Empty for older jobs. */
	answer_regions?: AnswerRegion[]
	/** MCQ only: available options for this question. */
	multiple_choice_options?: McqOption[]
	/** MCQ only: the correct option label(s) from the mark scheme. */
	correct_option_labels?: string[]
	/** Per-mark-point results from point_based grading. */
	mark_points_results?: MarkPointResult[]
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
	/** IDs of the current domain model run records. */
	submission_id?: string
	ocr_run_id?: string
	grading_run_id?: string
	enrichment_run_id?: string
	/** LLM run snapshots — which models were configured and which executed. */
	ocr_llm_snapshot?: unknown
	grading_llm_snapshot?: unknown
	enrichment_llm_snapshot?: unknown
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
	/** Number of versions (including superseded). 1 means no re-scans. */
	version_count?: number
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

// ─── Teacher Override types ─────────────────────────────────────────────────

export type TeacherOverride = {
	id: string
	submission_id: string
	question_id: string
	score_override: number
	reason: string | null
	feedback_override: string | null
	created_at: Date
	updated_at: Date
}

export type UpsertTeacherOverrideInput = {
	score_override: number
	reason?: string | null
	feedback_override?: string | null
}

export type UpsertTeacherOverrideResult =
	| { ok: true; override: TeacherOverride }
	| { ok: false; error: string }

export type DeleteTeacherOverrideResult =
	| { ok: true }
	| { ok: false; error: string }

export type GetTeacherOverridesResult =
	| { ok: true; overrides: TeacherOverride[] }
	| { ok: false; error: string }

// ─── Submission Feedback types ────────────────────────────────────────────────

export type SubmissionFeedbackRating = "positive" | "negative"

export type FeedbackCategory =
	| "scores"
	| "annotations"
	| "answer_extraction"
	| "feedback_text"
	| "other"

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
	scores: "Scores were wrong",
	answer_extraction: "Answer text was wrong",
	feedback_text: "Feedback was unhelpful",
	annotations: "Annotations were wrong",
	other: "Something else",
}

export type SubmissionFeedback = {
	id: string
	submission_id: string
	rating: SubmissionFeedbackRating
	categories: FeedbackCategory[] | null
	comment: string | null
	grading_run_id: string | null
	created_at: Date
	updated_at: Date
}

export type UpsertSubmissionFeedbackInput = {
	rating: SubmissionFeedbackRating
	categories?: FeedbackCategory[] | null
	comment?: string | null
}

export type UpsertSubmissionFeedbackResult =
	| { ok: true; feedback: SubmissionFeedback }
	| { ok: false; error: string }

export type GetSubmissionFeedbackResult =
	| { ok: true; feedback: SubmissionFeedback | null }
	| { ok: false; error: string }

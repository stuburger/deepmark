import type { JobEvent } from "@mcp-gcse/db"

/**
 * Status of the inline annotation step that now runs inside the grade Lambda.
 * Derived from GradingRun fields: `annotations_completed_at` and
 * `annotation_error`. No separate enrichment_runs row exists anymore.
 */
export type AnnotationStatus = "pending" | "processing" | "complete" | "failed"
import type {
	BoundaryMode,
	GradeBoundary,
	AnnotationPayload as SharedAnnotationPayload,
	AnswerRegion as SharedAnswerRegion,
	AnyAnnotationPayload as SharedAnyAnnotationPayload,
	ChainPayload as SharedChainPayload,
	ExamPaperQuestion as SharedExamPaperQuestion,
	ExtractedAnswer as SharedExtractedAnswer,
	GradingResult as SharedGradingResult,
	MarkPointResult as SharedMarkPointResult,
	MarkSignal as SharedMarkSignal,
	McqOption as SharedMcqOption,
	OverlayType as SharedOverlayType,
	PageToken as SharedPageToken,
	ResultStimulus as SharedResultStimulus,
	StudentPaperAnnotation as SharedStudentPaperAnnotation,
} from "@mcp-gcse/shared"

/** Per-page OCR result from the Gemini transcript call. */
export type HandwritingAnalysis = {
	transcript: string
	observations: string[]
}

export type PageToken = SharedPageToken

export type MarkPointResult = SharedMarkPointResult

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

export type AnswerRegion = SharedAnswerRegion

// ─── Annotation types (re-exported from @mcp-gcse/shared) ───────────────────

export type OverlayType = SharedOverlayType
export type MarkSignal = SharedMarkSignal
export type AnnotationPayload = SharedAnnotationPayload
export type ChainPayload = SharedChainPayload
export type AnyAnnotationPayload = SharedAnyAnnotationPayload
export type StudentPaperAnnotation = SharedStudentPaperAnnotation

export type GetJobAnnotationsResult =
	| { ok: true; annotations: StudentPaperAnnotation[] }
	| { ok: false; error: string }

// ─── Grading types ───────────────────────────────────────────────────────────

export type McqOption = SharedMcqOption
export type ResultStimulus = SharedResultStimulus
export type GradingResult = SharedGradingResult
export type TriggerGradingResult = { ok: true } | { ok: false; error: string }
export type ExtractedAnswer = SharedExtractedAnswer
export type ExamPaperQuestion = SharedExamPaperQuestion

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
	/** Derived annotation status — annotations now run inside the grade Lambda. */
	annotation_status: AnnotationStatus | null
	level_descriptors: string | null
	/** Paper-level grade boundaries (computed grade is derived on the fly). */
	tier: "foundation" | "higher" | null
	grade_boundaries: GradeBoundary[] | null
	grade_boundary_mode: BoundaryMode | null
	/** IDs of the current domain model run records. */
	submission_id?: string
	ocr_run_id?: string
	grading_run_id?: string
	/** 3-line LLM-generated student summary (strength / weakness / improvement). */
	examiner_summary?: string | null
	/** LLM run snapshots — which models were configured and which executed. */
	ocr_llm_snapshot?: unknown
	grading_llm_snapshot?: unknown
	annotation_llm_snapshot?: unknown
	/** All questions from the exam paper in display order. Present when an exam
	 *  paper is linked. Used to seed skeleton document blocks before grading
	 *  results arrive. */
	exam_paper_questions?: ExamPaperQuestion[] | null
}

export type GetStudentPaperJobResult =
	| { ok: true; data: StudentPaperJobPayload }
	| { ok: false; error: string }

export type StudentPaperResultPayload = StudentPaperJobPayload

export type UpdateStudentNameResult =
	| { ok: true }
	| { ok: false; error: string }

export type ScanPage = {
	order: number
	/** S3 object key retained for diagnostics; page images stream via submission-scoped routes. */
	key: string
	mimeType: string
	/** Per-page OCR analysis (transcript + observations). Present for jobs
	 *  processed after the OCR pipeline was added; absent for older jobs. */
	analysis?: HandwritingAnalysis
}

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

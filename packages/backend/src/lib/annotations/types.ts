import type { GradingResult } from "@/lib/grading/grade-questions"
import type { MarkingMethod } from "@mcp-gcse/db"
import type {
	AnnotationPayload,
	ChainPayload,
	GcseMarkPoint,
	LlmRunner,
	LlmTimeoutMs,
	NormalisedBox,
	QuestionStimulusContext,
} from "@mcp-gcse/shared"

type BasePendingAnnotation = {
	questionId: string
	pageOrder: number
	sentiment: string
	/**
	 * The exact substring of `student_answer` this annotation covers. Source
	 * of truth for what was annotated. Always equal to
	 * `student_answer.slice(charStart, charEnd)` — verified at construction
	 * time; malformed records are dropped before reaching this type.
	 */
	phrase: string
	/** Inclusive UTF-16 char offset into `student_answer`. */
	charStart: number
	/** Exclusive UTF-16 char offset into `student_answer`. */
	charEnd: number
	/**
	 * Token IDs whose char range overlaps [charStart, charEnd) — first and
	 * last in reading order. Used to compute the scan-overlay bbox; null when
	 * no token covers the range (e.g. the phrase falls in inserted
	 * punctuation that has no underlying OCR token).
	 */
	anchorTokenStartId: string | null
	anchorTokenEndId: string | null
	/**
	 * Bounding-box hull of the tokens covered by the char range. Used for the
	 * `student_paper_annotations.bbox` denormalised column and the scan
	 * overlay's initial render. The PM doc's `ocrToken` marks are the
	 * canonical source of truth for per-word bboxes; this hull is a
	 * convenience.
	 */
	bbox: NormalisedBox
	sortOrder: number
}

/**
 * Discriminated by overlayType: "annotation" pairs with AnnotationPayload,
 * "chain" pairs with ChainPayload. Keeps construction sites honest and
 * removes the need for a wildcard `Record<string, unknown>` payload.
 */
export type PendingAnnotation =
	| (BasePendingAnnotation & {
			overlayType: "annotation"
			payload: AnnotationPayload
	  })
	| (BasePendingAnnotation & {
			overlayType: "chain"
			payload: ChainPayload
	  })

export type AnswerRegionRow = {
	question_id: string
	page_order: number
	box: unknown
}

export type MarkSchemeForAnnotation = {
	description: string
	guidance: string | null
	mark_points: GcseMarkPoint[]
	marking_method: MarkingMethod
	content: string
}

export type TokenRow = {
	id: string
	page_order: number
	text_raw: string
	text_corrected: string | null
	bbox: unknown
	question_id: string | null
	answer_char_start: number | null
	answer_char_end: number | null
}

export type AnnotateOneQuestionArgs = {
	gradingResult: GradingResult
	/** Stimuli the question references — empty/undefined when standalone. */
	stimuli?: QuestionStimulusContext[]
	allTokens: TokenRow[]
	examBoard: string | null
	levelDescriptors: string | null
	subject: string | null
	markScheme: MarkSchemeForAnnotation | null
	llm: LlmRunner
	jobId: string
	/** Per-attempt wall-clock budget forwarded to the runner. */
	timeoutMs?: LlmTimeoutMs
}

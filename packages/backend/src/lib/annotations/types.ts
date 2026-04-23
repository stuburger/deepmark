import type { GradingResult } from "@/lib/grading/grade-questions"
import type { MarkingMethod } from "@mcp-gcse/db"
import type {
	AnnotationPayload,
	ChainPayload,
	GcseMarkPoint,
	LlmRunner,
	NormalisedBox,
	QuestionStimulusContext,
} from "@mcp-gcse/shared"

type BasePendingAnnotation = {
	questionId: string
	pageOrder: number
	sentiment: string
	anchorTokenStartId: string | null
	anchorTokenEndId: string | null
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
}

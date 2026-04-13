import type { GradingResult } from "@/lib/grading/grade-questions"
import type { LlmRunner, NormalisedBox } from "@mcp-gcse/shared"

export type PendingAnnotation = {
	questionId: string
	pageOrder: number
	overlayType: string
	sentiment: string
	payload: Record<string, unknown>
	anchorTokenStartId: string | null
	anchorTokenEndId: string | null
	bbox: NormalisedBox
	parentIndex: number | undefined
	sortOrder: number
}

export type AnswerRegionRow = {
	question_id: string
	page_order: number
	box: unknown
}

export type MarkSchemeForAnnotation = {
	description: string
	guidance: string | null
	mark_points: unknown
	marking_method: string
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
	allTokens: TokenRow[]
	examBoard: string | null
	levelDescriptors: string | null
	subject: string | null
	markScheme: MarkSchemeForAnnotation | null
	llm: LlmRunner
	jobId: string
}

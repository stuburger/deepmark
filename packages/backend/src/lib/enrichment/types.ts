import type { GradingResult } from "@/lib/grading/grade-questions"
import type { NormalisedBox } from "@mcp-gcse/shared"
import type { LanguageModel } from "ai"

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
	marking_rules: unknown | null
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
	model: LanguageModel
	jobId: string
}

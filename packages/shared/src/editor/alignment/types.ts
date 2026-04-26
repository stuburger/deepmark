import type { MarkSignal } from "../../annotation/types"

/** Per-token alignment to character positions in student_answer */
export type TokenAlignment = {
	tokenMap: Record<string, { start: number; end: number }>
	confidence: number
}

/** All annotation signal names — the 6 physical mark signals plus chain. */
export type AnnotationSignal = MarkSignal | "chain"

/** PM-style mark: typed decoration over a character range */
export type TextMark = {
	from: number
	to: number
	type: AnnotationSignal
	sentiment: "positive" | "negative" | "neutral"
	attrs: Record<string, unknown>
	annotationId: string
}

/** Text split at mark boundaries — for span rendering */
export type TextSegment = {
	text: string
	marks: TextMark[]
}

export type WordWithOffset = { word: string; start: number; end: number }

export type ResolvedTokenSpan = {
	startTokenId: string
	endTokenId: string
	tokenIds: string[]
	bbox: [number, number, number, number]
	pageOrder: number
}

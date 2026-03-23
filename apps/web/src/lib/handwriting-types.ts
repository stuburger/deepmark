/**
 * Shared types for OCR / handwriting analysis (Gemini) used by the PDF student-paper
 * pipeline and UI components. Kept separate from server actions to avoid pulling
 * server-only modules into client components.
 */

export type HandwritingFeature = {
	box_2d: [number, number, number, number]
	label: string
	feature_type: string
}

export type HandwritingAnalysis = {
	transcript: string
	features: HandwritingFeature[]
	observations: string[]
}

export type MarkPointResult = {
	pointNumber: number
	awarded: boolean
	reasoning: string
	expectedCriteria: string
	studentCovered: string
}

/** Shape used by GradedScanViewer / layout helpers (legacy scan UI types). */
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
	boundingBoxes: HandwritingFeature[]
	answerRegion: [number, number, number, number] | null
	isContinuation: boolean
}

export type GradedPage = {
	pageNumber: number
	imageUrl: string
	gradedAnswers: GradedAnswerOnPage[]
}

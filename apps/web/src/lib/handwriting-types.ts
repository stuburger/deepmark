/**
 * Shared types for OCR / handwriting analysis used by the PDF student-paper
 * pipeline and UI components. Kept separate from server actions to avoid
 * pulling server-only modules into client components.
 */

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

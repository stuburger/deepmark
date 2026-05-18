// Bbox format used throughout DeepMark: [yMin, xMin, yMax, xMax] normalised to 0-1000.
export type Bbox = readonly [number, number, number, number]

export type AnnotationSignal =
	| "underline"
	| "double_underline"
	| "box"
	| "circle"
	| "tick"
	| "cross"

export type AnnotationSentiment = "positive" | "negative" | "neutral"

export type Annotation = {
	signal: AnnotationSignal
	sentiment: AnnotationSentiment
	bbox: Bbox
	reason: string
	comment?: string
	aoDisplay?: string
	aoQuality?: "strong" | "valid" | "partial" | "incorrect"
}

export type PageScene = {
	pageImage: string
	questionNumber: string
	questionText: string
	maxMarks: number
	awarded: number
	feedbackSummary: string
	annotations: Annotation[]
}

export type Fixture = {
	studentName: string
	paperTitle: string
	totalAwarded: number
	totalMax: number
	scenes: PageScene[]
}

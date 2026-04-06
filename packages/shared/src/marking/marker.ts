import type { QuestionGrade, QuestionWithMarkScheme } from "../grading/types"

/**
 * Optional context passed through the marker pipeline. Extensible — future marking
 * methods may need additional context fields.
 */
export interface MarkerContext {
	/** Exam-wide level descriptors provided by the teacher (used by LoR marker). */
	levelDescriptors?: string
}

/**
 * A marker grades a single question/answer pair. Implementations declare whether they can handle
 * a question via canMark(), then perform grading via mark().
 */
export interface Marker {
	canMark(question: QuestionWithMarkScheme, answer: string): boolean
	mark(
		question: QuestionWithMarkScheme,
		answer: string,
		context?: MarkerContext,
	): Promise<QuestionGrade>
}

/**
 * Uses the first marker whose canMark() returns true. Typical order:
 * DeterministicMarker (MCQ), LevelOfResponseMarker, then LlmMarker (written / fallback).
 */
export class MarkerOrchestrator {
	constructor(private readonly markers: Marker[]) {}

	async mark(
		question: QuestionWithMarkScheme,
		answer: string,
		context?: MarkerContext,
	): Promise<QuestionGrade> {
		for (const marker of this.markers) {
			if (marker.canMark(question, answer)) {
				return marker.mark(question, answer, context)
			}
		}
		throw new Error(
			`No marker available for question ${question.id} (type: ${question.questionType})`,
		)
	}
}

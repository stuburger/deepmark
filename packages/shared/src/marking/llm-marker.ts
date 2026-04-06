import type { Grader } from "../grading/grader"
import type {
	LearningContentItem,
	PointBasedQuestionGrade,
	QuestionWithMarkScheme,
} from "../grading/types"
import type { Marker, MarkerContext } from "./marker"

/**
 * Marker that delegates to the AI Grader. Used for written questions and as fallback
 * when deterministic marking is not applicable. Optional learningContent is passed to the grader.
 */
export class LlmMarker implements Marker {
	constructor(
		private readonly grader: Grader,
		private readonly learningContent?: LearningContentItem[],
	) {}

	canMark(_question: QuestionWithMarkScheme, _answer: string): boolean {
		return true
	}

	async mark(
		question: QuestionWithMarkScheme,
		answer: string,
		_context?: MarkerContext,
	): Promise<PointBasedQuestionGrade> {
		return this.grader.gradeSingleResponse({
			question,
			answer,
			learningContent: this.learningContent,
		})
	}
}

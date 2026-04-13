import type { Grader } from "../grading/grader"
import type { LoRQuestionGrade, QuestionWithMarkScheme } from "../grading/types"
import type { Marker, MarkerContext } from "./marker"

/**
 * Marker for Level-of-Response (LoR) questions. Uses the content field
 * to build an LoR prompt and delegates to Grader.gradeSingleResponseLoR.
 */
export class LevelOfResponseMarker implements Marker {
	constructor(private readonly grader: Grader) {}

	canMark(question: QuestionWithMarkScheme, _answer: string): boolean {
		return question.markingMethod === "level_of_response"
	}

	async mark(
		question: QuestionWithMarkScheme,
		answer: string,
		context?: MarkerContext,
	): Promise<LoRQuestionGrade> {
		return this.grader.gradeSingleResponseLoR({
			question,
			answer,
			levelDescriptors: context?.levelDescriptors,
		})
	}
}

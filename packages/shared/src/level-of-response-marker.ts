import {
  type QuestionGrade,
  type QuestionWithMarkScheme,
} from "./grader";
import type { Grader } from "./grader";
import type { Marker, MarkerContext } from "./marker";

/**
 * Marker for Level-of-Response (LoR) questions. Uses markingRules.levels and caps
 * to build an AQA-style LoR prompt and delegates to Grader.gradeSingleResponseLoR.
 */
export class LevelOfResponseMarker implements Marker {
  constructor(private readonly grader: Grader) {}

  canMark(question: QuestionWithMarkScheme, _answer: string): boolean {
    return question.markingMethod === "level_of_response";
  }

  async mark(
    question: QuestionWithMarkScheme,
    answer: string,
    context?: MarkerContext,
  ): Promise<QuestionGrade> {
    return this.grader.gradeSingleResponseLoR({
      question,
      answer,
      levelDescriptors: context?.levelDescriptors,
    });
  }
}

import {
  Grader,
  type LearningContentItem,
  type QuestionGrade,
  type QuestionWithMarkScheme,
} from "./grader";
import type { Marker } from "./marker";

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
    return true;
  }

  async mark(
    question: QuestionWithMarkScheme,
    answer: string,
  ): Promise<QuestionGrade> {
    return this.grader.gradeSingleResponse({
      question,
      answer,
      learningContent: this.learningContent,
    });
  }
}

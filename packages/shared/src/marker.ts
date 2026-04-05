import type { QuestionWithMarkScheme, QuestionGrade } from "./grader";

// ============================================
// MARKER INTERFACE
// ============================================

/**
 * Optional context passed through the marker pipeline. Extensible — future marking
 * methods may need additional context fields.
 */
export interface MarkerContext {
  /** Exam-wide level descriptors provided by the teacher (used by LoR marker). */
  levelDescriptors?: string;
}

/**
 * A marker grades a single question/answer pair. Implementations declare whether they can handle
 * a question via canMark(), then perform grading via mark().
 */
export interface Marker {
  canMark(question: QuestionWithMarkScheme, answer: string): boolean;
  mark(
    question: QuestionWithMarkScheme,
    answer: string,
    context?: MarkerContext,
  ): Promise<QuestionGrade>;
}

// ============================================
// DETERMINISTIC MARKER (MCQ)
// ============================================

/**
 * Deterministic marker for multiple_choice questions when correctOptionLabels are known.
 * Compares student-selected option letters to the correct set; no LLM.
 */
export class DeterministicMarker implements Marker {
  canMark(question: QuestionWithMarkScheme, _answer: string): boolean {
    if (question.questionType !== "multiple_choice") return false;
    const labels = question.correctOptionLabels;
    return Array.isArray(labels) && labels.length > 0;
  }

  async mark(
    question: QuestionWithMarkScheme,
    answer: string,
    _context?: MarkerContext,
  ): Promise<QuestionGrade> {
    const correctOptionLabels = question.correctOptionLabels;
    if (
      !correctOptionLabels ||
      correctOptionLabels.length === 0 ||
      question.questionType !== "multiple_choice"
    ) {
      throw new Error(
        `DeterministicMarker cannot grade question ${question.id}: not multiple_choice or missing correctOptionLabels`,
      );
    }

    const studentSelected = answer
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .split("")
      .filter(Boolean)
      .sort();
    const correct = [...correctOptionLabels].map((l) => l.toUpperCase()).sort();

    const isCorrect =
      studentSelected.length === correct.length &&
      studentSelected.every((opt) => correct.includes(opt));

    const totalScore = isCorrect ? question.totalPoints : 0;
    const maxPossibleScore = question.totalPoints;
    const scorePercentage =
      maxPossibleScore > 0
        ? Math.round((totalScore / maxPossibleScore) * 100)
        : 0;

    const markPointsResults = question.markPoints.map((mp) => ({
      pointNumber: mp.pointNumber,
      awarded: isCorrect,
      reasoning: isCorrect
        ? `Student selected [${studentSelected.join(", ")}], which matches the correct answer [${correct.join(", ")}].`
        : `Student selected [${studentSelected.join(", ")}]; correct answer is [${correct.join(", ")}].`,
      expectedCriteria: `Must select exactly: ${correct.join(", ")}`,
      studentCovered:
        studentSelected.length > 0
          ? `Selected: ${studentSelected.join(", ")}`
          : "No options selected",
    }));

    const requiredMarkPoints = question.markPoints.filter((mp) => mp.isRequired);
    const passed =
      requiredMarkPoints.length === 0 ||
      requiredMarkPoints.every((reqMp) =>
        markPointsResults.some(
          (r) => r.pointNumber === reqMp.pointNumber && r.awarded,
        ),
      );

    const optionBreakdown =
      question.availableOptions && question.availableOptions.length > 0
        ? question.availableOptions
            .map((opt) => {
              const selected = studentSelected.includes(
                opt.optionLabel.toUpperCase(),
              );
              const shouldSelect = correct.includes(
                opt.optionLabel.toUpperCase(),
              );
              let status: string;
              if (selected && shouldSelect) status = "Correctly selected";
              else if (selected && !shouldSelect)
                status = "Incorrectly selected";
              else if (!selected && shouldSelect)
                status = "Should have been selected";
              else status = "Correctly not selected";
              return `${opt.optionLabel}: ${opt.optionText} - ${status}`;
            })
            .join("\n")
        : "";

    const feedbackSummary = isCorrect
      ? `Correct. You selected all the right options. Score: ${totalScore}/${maxPossibleScore}`
      : `Incorrect. The correct options are: ${correct.join(", ")}. Score: ${totalScore}/${maxPossibleScore}${optionBreakdown ? `\n\nOption breakdown:\n${optionBreakdown}` : ""}`;

    return {
      questionId: question.id,
      markPointsResults,
      totalScore,
      maxPossibleScore,
      scorePercentage,
      passed,
      llmReasoning: `Deterministic MCQ: student [${studentSelected.join(", ")}], correct [${correct.join(", ")}]. ${isCorrect ? "Full marks." : "Zero marks."}`,
      feedbackSummary,
      correctAnswer: correct.join(", "),
      relevantLearningSnippet: "",
    };
  }
}

// ============================================
// MARKER ORCHESTRATOR
// ============================================

/**
 * Uses the first marker whose canMark() returns true. Typical order:
 * DeterministicMarker (MCQ), then LlmMarker (written / fallback).
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
        return marker.mark(question, answer, context);
      }
    }
    throw new Error(
      `No marker available for question ${question.id} (type: ${question.questionType})`,
    );
  }
}

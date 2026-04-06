import { z } from "zod"
import { MarkPointResultSchema } from "./types"

// ============================================
// LLM OUTPUT SCHEMAS (validated via AI SDK structured output)
// ============================================

/** Schema for point-based / standard question grading output. */
export const QuestionGradeSchema = z.object({
	questionId: z.string().describe("The ID of the question being graded"),
	markPointsResults: z.array(MarkPointResultSchema),
	totalScore: z.number(),
	llmReasoning: z
		.string()
		.describe("Chain-of-thought reasoning for the overall marking process"),
	feedbackSummary: z
		.string()
		.describe("Overall feedback summary for the student"),
	correctAnswer: z
		.string()
		.describe(
			"The correct/model answer for this question - what the student should have answered",
		),
	relevantLearningSnippet: z
		.string()
		.describe(
			"A relevant snippet from the learning material that explains or supports the correct answer. Empty if not applicable.",
		),
})

/** Schema for Level-of-Response grading output (includes LoR-specific fields). */
export const LoRQuestionGradeSchema = z.object({
	questionId: z.string().describe("The ID of the question being graded"),
	markPointsResults: z.array(MarkPointResultSchema),
	totalScore: z.number(),
	llmReasoning: z
		.string()
		.describe("Chain-of-thought reasoning for the overall marking process"),
	feedbackSummary: z
		.string()
		.describe("Overall feedback summary for the student"),
	correctAnswer: z
		.string()
		.describe(
			"The correct/model answer for this question - what the student should have answered",
		),
	relevantLearningSnippet: z
		.string()
		.describe(
			"A relevant snippet from the learning material that explains or supports the correct answer. Empty if not applicable.",
		),
	levelAwarded: z
		.number()
		.int()
		.min(0)
		.describe("The level (1-based) awarded for this response"),
	whyNotNextLevel: z
		.string()
		.describe(
			"Brief explanation of why the next level was not reached (or empty if full marks)",
		),
	capApplied: z
		.string()
		.describe("If a cap limited the mark, describe it; otherwise empty string"),
	whatWentWell: z
		.array(z.string())
		.max(3)
		.describe(
			"1-3 short bullets on what the student did well. Only credit what is actually present. Max 6 words each.",
		),
	whatDidntGoWell: z
		.array(z.string())
		.max(3)
		.describe(
			"1-3 short bullets on what was missing or weak. Actionable, student-facing. Max 6 words each.",
		),
})

/** Schema for batch grading (multiple point-based questions). */
export const BatchGradeSchema = z.object({
	questionGrades: z.array(QuestionGradeSchema),
})

/** Inferred type from the point-based LLM output schema. */
export type QuestionGradeResult = z.infer<typeof QuestionGradeSchema>

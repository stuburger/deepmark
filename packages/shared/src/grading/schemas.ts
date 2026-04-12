import { z } from "zod/v4"
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
		.describe(
			"Internal chain-of-thought for audit. Be thorough but teachers will not see this.",
		),
	feedbackSummary: z
		.string()
		.describe(
			"One sentence, max 20 words: state the mark awarded and the single most important reason.",
		),
	correctAnswer: z.string().describe("Leave as empty string."),
	relevantLearningSnippet: z.string().describe("Leave as empty string."),
	whatWentWell: z
		.array(z.string())
		.describe(
			"1-3 short bullets on what the student did well. Max 3 items, max 6 words each.",
		),
	whatDidntGoWell: z
		.array(z.string())
		.describe(
			"1-3 short bullets on what was missing or weak. Actionable, student-facing. Max 3 items, max 6 words each.",
		),
})

/** Schema for Level-of-Response grading output (includes LoR-specific fields). */
export const LoRQuestionGradeSchema = z.object({
	questionId: z.string().describe("The ID of the question being graded"),
	markPointsResults: z.array(MarkPointResultSchema),
	totalScore: z.number(),
	llmReasoning: z
		.string()
		.describe(
			"Internal chain-of-thought for audit. Be thorough but teachers will not see this.",
		),
	feedbackSummary: z
		.string()
		.describe(
			"One sentence, max 20 words: state the mark awarded and the single most important reason.",
		),
	correctAnswer: z.string().describe("Leave as empty string."),
	relevantLearningSnippet: z.string().describe("Leave as empty string."),
	levelAwarded: z
		.number()
		.describe(
			"The level as an integer (0 if no level reached, otherwise 1-based) awarded for this response",
		),
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
		.describe(
			"1-3 short bullets on what the student did well. Max 3 items, max 6 words each.",
		),
	whatDidntGoWell: z
		.array(z.string())
		.describe(
			"1-3 short bullets on what was missing or weak. Actionable, student-facing. Max 3 items, max 6 words each.",
		),
})

/** Schema for batch grading (multiple point-based questions). */
export const BatchGradeSchema = z.object({
	questionGrades: z.array(QuestionGradeSchema),
})

/** Inferred type from the point-based LLM output schema. */
export type QuestionGradeResult = z.infer<typeof QuestionGradeSchema>

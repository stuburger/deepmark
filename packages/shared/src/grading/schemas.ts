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
			"1-3 short bullets on what the student did well, referencing question context where possible. Max 3 items, max 8 words each.",
		),
	whatDidntGoWell: z
		.array(z.string())
		.describe(
			"1-3 actionable improvement tips phrased as 'Try...' or 'Next time...'. Reference the question context. Max 3 items, max 8 words each. Never state what was wrong — only what to do better.",
		),
})

/**
 * Discrete descriptor evaluation — one per descriptor bullet at the awarded
 * Level and the next Level. The combination of {met, evidence} forces the
 * model to commit to specific decisions instead of vibe-grading, which is
 * what makes the resulting Level award repeatable across runs.
 */
export const DescriptorEvaluationSchema = z.object({
	descriptor: z
		.string()
		.describe(
			"Verbatim descriptor bullet from the mark scheme (copy exactly, do not paraphrase).",
		),
	met: z
		.boolean()
		.describe(
			"True if the response clearly demonstrates this descriptor; false otherwise. Binary — no 'partially'.",
		),
	evidence: z
		.string()
		.describe(
			"When met: short verbatim quote from the student response (min 8 words) that demonstrates this descriptor. When not met: short description of what's missing (e.g. 'no chain of reasoning past the first consequence'). Never empty.",
		),
})

/** One per AO dimension iterated from the question's ao_allocations. */
export const AoAwardSchema = z.object({
	aoCode: z
		.string()
		.describe(
			"AO code matching the dimension being graded — copy exactly from ao_allocations (e.g. 'AO5'), or 'Overall' when no AO breakdown is printed.",
		),
	levelAwarded: z
		.number()
		.describe("Level awarded for this dimension (1-based integer)."),
	awardedMarks: z
		.number()
		.describe(
			"Marks awarded within the level's range (integer). Must be inside the level's printed band.",
		),
	maxMarks: z
		.number()
		.describe(
			"Max marks for this dimension (integer; from ao_allocations.marks, or totalPoints for single-skill 'Overall').",
		),
	descriptorEvaluations: z
		.array(DescriptorEvaluationSchema)
		.describe(
			"Discrete evaluations of every descriptor at the awarded Level AND the next Level above (no need to evaluate Levels below). Awarded-Level descriptors should be mostly met; next-Level descriptors should be mostly not-met (with evidence either way).",
		),
	whyNotNextLevel: z
		.string()
		.describe(
			"One sentence explaining why this dimension didn't reach the next Level, citing the not-met descriptors. Empty string if at top Level.",
		),
})

/** Schema for Level-of-Response grading output. */
export const LoRQuestionGradeSchema = z.object({
	questionId: z.string().describe("The ID of the question being graded"),
	markPointsResults: z.array(MarkPointResultSchema),
	aoAwards: z
		.array(AoAwardSchema)
		.describe(
			"One award per AO dimension. If ao_allocations is empty in the input, return exactly one award with aoCode='Overall' and maxMarks=totalPoints.",
		),
	totalScore: z
		.number()
		.describe(
			"Sum of awardedMarks across aoAwards (integer). Must equal the aggregate exactly.",
		),
	levelAwarded: z
		.number()
		.describe(
			"Headline Level (integer) — mirror aoAwards[0].levelAwarded for single-skill marking. For multi-skill questions this is the primary AO's Level; the canonical per-AO data lives in aoAwards.",
		),
	whyNotNextLevel: z
		.string()
		.describe(
			"Headline reason this answer didn't reach the next Level (single-skill summary). Empty if at top Level.",
		),
	capApplied: z
		.string()
		.describe("If a cap limited the mark, describe it; otherwise empty string"),
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
			"1-3 short bullets on what the student did well, derived from MET descriptors. Reference the question context. Max 3 items, max 8 words each.",
		),
	whatDidntGoWell: z
		.array(z.string())
		.describe(
			"1-3 actionable improvement tips derived from NOT-MET next-Level descriptors, phrased as 'Try...' or 'Next time...'. Reference the question context. Max 3 items, max 8 words each. Never state what was wrong — only what to do better.",
		),
})

/** Schema for batch grading (multiple point-based questions). */
export const BatchGradeSchema = z.object({
	questionGrades: z.array(QuestionGradeSchema),
})

/** Inferred type from the point-based LLM output schema. */
export type QuestionGradeResult = z.infer<typeof QuestionGradeSchema>

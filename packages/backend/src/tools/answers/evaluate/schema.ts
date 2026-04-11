import { z } from "zod/v4"

export const EvaluateAnswerSchema = {
	question_id: z
		.string()
		.describe("ID of the question to evaluate the answer against"),
	student_answer: z
		.string()
		.min(1)
		.describe("The student answer text to evaluate"),
	mark_scheme_id: z
		.string()
		.optional()
		.describe(
			"Optional: Specific mark scheme ID (if not provided, will find the appropriate mark scheme)",
		),
	expected_score: z
		.number()
		.min(0)
		.optional()
		.describe(
			"Optional: Expected score for this answer (used for mark scheme testing and refinement)",
		),
}

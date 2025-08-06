import { z } from "zod"

export const EvaluateAnswerSchema = {
	question_id: z
		.string()
		.describe("ID of the question to evaluate the answer against"),
	question_part_id: z
		.string()
		.optional()
		.describe(
			"Optional: ID of the specific question part (for multi-part questions)",
		),
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
}

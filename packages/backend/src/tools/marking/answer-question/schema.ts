import { z } from "zod"

export const AnswerQuestionSchema = {
	question_id: z.string().min(1).describe("The ID of the question to answer"),
	question_part_id: z
		.string()
		.optional()
		.describe(
			"The ID of the specific question part to answer (optional - omit for whole question answers)",
		),
	student_answer: z
		.string()
		.min(1)
		.describe("The student's answer to the question"),
}

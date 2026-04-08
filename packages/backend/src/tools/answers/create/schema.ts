import { z } from "zod"

export const AnswerQuestionSchema = {
	question_id: z.string().min(1).describe("The ID of the question to answer"),
	student_answer: z
		.string()
		.min(1)
		.describe("The student's answer to the question"),
}

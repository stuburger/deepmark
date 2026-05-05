import { z } from "zod/v4"

export const AnswerQuestionSchema = {
	question_id: z.string().min(1).describe("The ID of the question to answer"),
	submission_id: z
		.string()
		.min(1)
		.describe(
			"The ID of the student submission this answer belongs to. " +
				"Answers are scoped to a submission — call create-student-submission first if you don't have one.",
		),
	student_answer: z
		.string()
		.min(1)
		.describe("The student's answer to the question"),
}

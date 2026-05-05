import { AnswerQuestionSchema } from "./schema"

import { db } from "@/db"
import { tool } from "@/tools/shared/tool-utils"

export const handler = tool(AnswerQuestionSchema, async (args) => {
	const { question_id, submission_id, student_answer } = args

	console.log("[answer-question] Handler invoked", {
		question_id,
		submission_id,
	})

	const [question, submission] = await Promise.all([
		db.question.findUniqueOrThrow({ where: { id: question_id } }),
		db.studentSubmission.findUniqueOrThrow({
			where: { id: submission_id },
			select: { id: true },
		}),
	])

	const maxPossibleScore = question.points || 0

	const answer = await db.answer.upsert({
		where: {
			submission_id_question_id: {
				submission_id: submission.id,
				question_id,
			},
		},
		create: {
			question_id,
			submission_id: submission.id,
			student_answer,
			submitted_at: new Date(),
			max_possible_score: maxPossibleScore,
			marking_status: "pending",
		},
		update: {
			student_answer,
			submitted_at: new Date(),
			marking_status: "pending",
		},
	})

	console.log("[answer-question] Successfully submitted answer", {
		answer_id: answer.id,
		question_id,
		submission_id: submission.id,
	})

	return `Answer submitted successfully! Answer ID: ${answer.id}`
})

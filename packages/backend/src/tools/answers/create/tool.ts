import { AnswerQuestionSchema } from "./schema"

import { db } from "@/db"
import { tool } from "@/tools/shared/tool-utils"

export const handler = tool(AnswerQuestionSchema, async (args, extra) => {
	const { question_id, student_answer } = args
	const { userId } = extra.authInfo.extra

	console.log("[answer-question] Handler invoked", { question_id })

	// Verify the question exists and get its details
	const question = await db.question.findUniqueOrThrow({
		where: { id: question_id },
	})

	const maxPossibleScore = question.points || 0

	const answer = await db.answer.create({
		data: {
			question_id,
			student_id: userId,
			student_answer,
			submitted_at: new Date(),
			max_possible_score: maxPossibleScore,
			marking_status: "pending" as const,
		},
	})

	console.log("[answer-question] Successfully submitted answer", {
		answer_id: answer.id,
		question_id,
		student_id: userId,
	})

	return `Answer submitted successfully! Answer ID: ${answer.id}`
})

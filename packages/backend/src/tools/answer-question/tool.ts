import { AnswerQuestionSchema } from "./schema"

import { tool } from "../tool-utils"
import { db } from "@/db"
import type { Answer, QuestionPart } from "@/generated/prisma"

export const handler = tool(AnswerQuestionSchema, async (args, extra) => {
	const { question_id, question_part_id, student_answer, student_id } = args

	console.log("[answer-question] Handler invoked", {
		question_id,
		question_part_id,
		student_id,
	})

	// Verify the question exists and get its details
	const question = await db.question.findUniqueOrThrow({
		where: { id: question_id },
		include: { question_parts: true },
	})

	// If question_part_id is provided, verify the part exists
	let questionPart: QuestionPart | undefined
	let maxPossibleScore = question.points || 0

	if (question_part_id) {
		questionPart = question.question_parts.find(
			(x) => x.id === question_part_id,
		)

		if (!questionPart) {
			throw new Error(
				`Question part with ID ${question_part_id} not found for question ${question_id}.`,
			)
		}

		// Use the part's points if available, otherwise use parent question points
		maxPossibleScore = questionPart.points || question.points || 0
	}

	const answer = await db.answer.create({
		data: {
			question_id,
			question_part_id: question_part_id || null,
			student_id,
			student_answer,
			submitted_at: new Date(),
			max_possible_score: maxPossibleScore,
			marking_status: "pending" as const,
		},
	})

	const partInfo = questionPart ? `(Part ${questionPart.part_label})` : ""

	console.log("[answer-question] Successfully submitted answer", {
		answer_id: answer.id,
		question_id,
		question_part_id,
		student_id,
	})

	return `Answer submitted successfully! Answer ID: ${answer.id} ${partInfo}`
})

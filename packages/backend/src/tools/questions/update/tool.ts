import { db } from "@/db"
import type { Question } from "@/generated/prisma"
import { tool } from "@/tools/shared/tool-utils"
import { UpdateQuestionByIdSchema } from "./schema"

export const handler = tool(UpdateQuestionByIdSchema, async (args, extra) => {
	const { id, topic, question_text, points, difficulty_level, subject } = args

	// Check if the question exists and has no answers
	const question = await db.question.findUniqueOrThrow({
		where: { id },
		include: { answers: true },
	})

	if (question.answers.length) {
		throw new Error("Cannot update a question with answers")
	}

	// Prepare update data
	const updateData: Partial<Question> = {}

	if (topic !== undefined) updateData.topic = topic
	if (question_text !== undefined) updateData.text = question_text
	if (points !== undefined) updateData.points = points
	if (difficulty_level !== undefined)
		updateData.difficulty_level = difficulty_level
	if (subject !== undefined) updateData.subject = subject

	const updatedQuestion = await db.question.update({
		where: { id },
		data: updateData,
	})

	const updatedFields = Object.keys(updateData).filter(
		(key) => key !== "updated_at",
	)

	const questionPreview = updatedQuestion?.text
		? updatedQuestion.text.substring(0, 100) +
			(updatedQuestion.text.length > 100 ? "..." : "")
		: "No question text"

	return `Question updated successfully!
Question ID: ${id}
Updated Fields: ${updatedFields.join(", ")}
Topic: ${updatedQuestion.topic}
Subject: ${updatedQuestion.subject}
Points: ${updatedQuestion.points}
Difficulty: ${updatedQuestion.difficulty_level}
Question Preview: ${questionPreview}`
})

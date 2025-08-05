import { UpdateQuestionByIdSchema } from "./schema"
import { tool } from "@/tools/shared/tool-utils"
import { db } from "@/db"
import type { Question } from "@/generated/prisma"

export const handler = tool(UpdateQuestionByIdSchema, async (args, extra) => {
	const userId = extra.authInfo.extra.userId
	const {
		id,
		topic,
		question_text,
		points,
		difficulty_level,
		subject,
		question_parts,
	} = args

	// Check if the question exists
	const question = await db.question.findUniqueOrThrow({
		where: { id },
		include: { answers: true, question_parts: { include: { answers: true } } },
	})

	if (
		question.answers.length ||
		question.question_parts.some((x) => x.answers.length > 0)
	) {
		throw new Error("Cannot update a question with answers")
	}

	// Prepare update data
	const updateData: Partial<Question> = {}

	// Add optional fields if provided
	if (topic !== undefined) {
		updateData.topic = topic
	}

	if (question_text !== undefined) {
		updateData.text = question_text
	}

	if (points !== undefined) {
		updateData.points = points
	}

	if (difficulty_level !== undefined) {
		updateData.difficulty_level = difficulty_level
	}

	if (subject !== undefined) {
		updateData.subject = subject
	}

	// Update the question in the database using a transaction
	const updatedQuestion = await db.$transaction(async (tx) => {
		// If question_parts are provided, replace all existing parts
		if (question_parts !== undefined) {
			// Delete existing question parts
			await tx.questionPart.deleteMany({
				where: { question_id: id },
			})

			// Create new question parts if any provided
			if (question_parts.length > 0) {
				await tx.questionPart.createMany({
					data: question_parts.map((p, i) => ({
						question_id: id,
						created_by_id: userId,
						order: i,
						part_label: p.part_label,
						text: p.part_text,
						points: p.part_points,
						difficulty_level: p.part_difficulty_level,
					})),
				})
			}
		}

		// Update the main question
		return await tx.question.update({
			where: { id },
			data: updateData,
			include: {
				question_parts: {
					orderBy: { order: "asc" },
				},
			},
		})
	})

	// Format the response
	const updatedFields = Object.keys(updateData).filter(
		(key) => key !== "updated_at",
	)

	// Add question_parts to updated fields if it was provided
	if (question_parts !== undefined) {
		updatedFields.push("question_parts")
	}

	const questionPreview = updatedQuestion?.text
		? updatedQuestion.text.substring(0, 100) +
			(updatedQuestion.text.length > 100 ? "..." : "")
		: "No question text"

	const partsInfo =
		question_parts !== undefined
			? `\nQuestion Parts: ${question_parts.length} parts (${question_parts.map((p) => p.part_label).join(", ")})`
			: updatedQuestion.question_parts.length > 0
				? `\nQuestion Parts: ${updatedQuestion.question_parts.length} existing parts`
				: ""

	return `Question updated successfully! 
Question ID: ${id}
Updated Fields: ${updatedFields.join(", ")}
Topic: ${updatedQuestion.topic}
Subject: ${updatedQuestion.subject}
Points: ${updatedQuestion.points}
Difficulty: ${updatedQuestion.difficulty_level}
Question Preview: ${questionPreview}${partsInfo}`
})

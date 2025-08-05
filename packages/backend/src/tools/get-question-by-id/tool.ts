import { GetQuestionByIdSchema } from "./schema"
import { db } from "@/db"
import { tool } from "../shared/tool-utils"

export const handler = tool(GetQuestionByIdSchema, async (args) => {
	const { id } = args

	// Query the database for the specific question
	const question = await db.question.findUniqueOrThrow({
		where: { id },
		include: {
			question_parts: {
				select: {
					order: true,
					id: true,
					points: true,
					text: true,
					part_label: true,
				},
			},
		},
	})

	// Build the question details
	let questionDetails = `Question Details:
ID: ${question.id}
Topic: ${question.topic}
Subject: ${question.subject}
Points: ${question.points || "Not specified"}
Difficulty Level: ${question.difficulty_level || "Not specified"}
Created At: ${question.created_at.toLocaleDateString()} ${question.created_at.toLocaleTimeString()}
Updated At: ${question.updated_at.toLocaleDateString()} ${question.updated_at.toLocaleTimeString()}

Question Text:
${question.text}`

	const parts = question.question_parts

	// Add question parts if they exist
	if (parts.length > 0) {
		questionDetails += `\n\nQuestion Parts (${parts.length} total):`

		for (const part of parts) {
			questionDetails += `
Part ${part.part_label} (Order: ${part.order}):
ID: ${part.id}
Text: ${part.text}
Points: ${part.points || "Not specified"}`
		}
	} else {
		questionDetails +=
			"\n\nQuestion Parts: None (this is a standalone question)"
	}

	return questionDetails
})

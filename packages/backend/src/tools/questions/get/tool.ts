import { GetQuestionByIdSchema } from "./schema"
import { db } from "@/db"
import { tool } from "@/tools/shared/tool-utils"

export const handler = tool(GetQuestionByIdSchema, async (args) => {
	const { id } = args

	// Query the database for the specific question
	const question = await db.question.findUniqueOrThrow({
		where: { id },
	})

	// Build the question details
	const questionDetails = `Question Details:
ID: ${question.id}
Topic: ${question.topic}
Subject: ${question.subject}
Points: ${question.points || "Not specified"}
Difficulty Level: ${question.difficulty_level || "Not specified"}
Question Number: ${question.question_number || "Not specified"}
Part Label: ${question.part_label || "None (standalone question)"}
Parent Number: ${question.parent_number || "None"}
Created At: ${question.created_at.toLocaleDateString()} ${question.created_at.toLocaleTimeString()}
Updated At: ${question.updated_at.toLocaleDateString()} ${question.updated_at.toLocaleTimeString()}

Question Text:
${question.text}${question.stem_text ? `\n\nStem/Context:\n${question.stem_text}` : ""}`

	return questionDetails
})

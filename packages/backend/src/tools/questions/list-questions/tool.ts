import { ListQuestionsSchema } from "./schema"
import { questions } from "../../db/collections/questions"
import { tool } from "@/tools/shared/tool-utils"
import type { Prisma } from "@/generated/prisma"
import { db } from "@/db"

export const handler = tool(ListQuestionsSchema, async (args) => {
	const { subject } = args

	// Build the where clause conditionally
	const whereClause: Prisma.QuestionWhereInput = subject ? { subject } : {}

	const questions = await db.question.findMany({
		where: whereClause,
	})

	console.log("[list-questions] Found questions", {
		count: questions.length,
		subject: subject || "all subjects",
	})

	if (questions.length === 0) {
		const message = subject
			? `No questions found for subject: ${subject}`
			: "No questions found in the database"

		return message
	}

	return `Found ${questions.length} question(s):
  <Question>
  ${questions.map((question, index) => {
		return `${index + 1}. ID: ${question.id}
   Topic: ${question.topic}
   Subject: ${question.subject}
   Points: ${question.points || "Not specified"}
   Difficulty: ${question.difficulty_level || "Not specified"}
   Created: ${question.created_at.toLocaleDateString()}
   Question: ${question.text}`
	})}
  </Question>
  `
})

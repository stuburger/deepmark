import { CreateQuestionSchema } from "./schema"
import { db } from "../../db/client"
import { tool } from "../tool-utils"

export const handler = tool(CreateQuestionSchema, async (args, extra) => {
	const userId = extra.authInfo.extra.userId
	const {
		topic,
		question_text,
		points,
		difficulty_level,
		subject,
		question_parts,
	} = args

	console.log("[create-question] Handler invoked", {
		topic,
		subject,
		points,
		difficulty_level,
		partsCount: question_parts.length,
	})

	// Create the question using Prisma
	const question = await db.question.create({
		data: {
			text: question_text,
			topic,
			subject,
			points,
			difficulty_level,
			created_by_id: userId,
			question_parts: {
				createMany: {
					data: question_parts.map((p, i) => ({
						created_by_id: userId,
						order: i,
						part_label: p.part_label,
						text: p.part_text,
						points: p.part_points,
						difficulty_level: p.part_difficulty_level,
					})),
				},
			},
		},
		include: {
			created_by: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
		},
	})

	console.log("[create-question] Question created successfully", {
		questionId: question.id,
		createdBy: question.created_by,
	})

	return `
Question created successfully! 
Question ID: ${question.id}
Created by: ${question.created_by.name} (${question.created_by.email})
`
})

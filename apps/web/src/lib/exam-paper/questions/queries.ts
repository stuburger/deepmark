"use server"

import { resourceAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { z } from "zod"
import type { MultipleChoiceOption, QuestionDetail } from "../types"

export const getQuestionDetail = resourceAction({
	type: "question",
	role: "viewer",
	schema: z.object({ questionId: z.string() }),
	id: ({ questionId }) => questionId,
}).action(
	async ({
		parsedInput: { questionId },
	}): Promise<{ question: QuestionDetail | null }> => {
		const question = await db.question.findUnique({
			where: { id: questionId },
			select: {
				id: true,
				text: true,
				question_type: true,
				origin: true,
				topic: true,
				subject: true,
				points: true,
				created_at: true,
				source_pdf_ingestion_job_id: true,
				question_number: true,
				multiple_choice_options: true,
				mark_schemes: {
					orderBy: { created_at: "asc" },
					select: {
						id: true,
						description: true,
						guidance: true,
						points_total: true,
						marking_method: true,
						mark_points: true,
						content: true,
						link_status: true,
						correct_option_labels: true,
					},
				},
			},
		})
		if (!question) return { question: null }

		const rawOptions = Array.isArray(question.multiple_choice_options)
			? (question.multiple_choice_options as MultipleChoiceOption[])
			: []

		return {
			question: {
				id: question.id,
				text: question.text,
				question_type: question.question_type,
				origin: question.origin,
				topic: question.topic,
				subject: question.subject,
				points: question.points,
				created_at: question.created_at,
				source_pdf_ingestion_job_id: question.source_pdf_ingestion_job_id,
				question_number: question.question_number,
				multiple_choice_options: rawOptions,
				mark_schemes: question.mark_schemes.map((ms) => ({
					id: ms.id,
					// Normalize the string "null" that Gemini sometimes writes into the description field
					description:
						ms.description === "null" || !ms.description
							? null
							: ms.description,
					guidance: ms.guidance,
					points_total: ms.points_total,
					marking_method: ms.marking_method,
					mark_points: ms.mark_points,
					content: ms.content,
					link_status: ms.link_status,
					correct_option_labels: ms.correct_option_labels,
				})),
			},
		}
	},
)

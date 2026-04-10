import { z } from "zod"

export const QuestionPaperSchema = z.object({
	questions: z.array(
		z.object({
			question_text: z.string(),
			question_type: z
				.string()
				.optional()
				.describe("written | multiple_choice"),
			total_marks: z.number().int(),
			question_number: z.string().optional(),
			options: z
				.array(
					z.object({
						option_label: z
							.string()
							.describe("The option label, e.g. A, B, C, D"),
						option_text: z
							.string()
							.describe("The full text of this answer option"),
					}),
				)
				.nullable()
				.optional()
				.describe(
					"For multiple choice questions: the answer options. Only include when question_type is multiple_choice.",
				),
		}),
	),
})

export const QuestionPaperMetadataSchema = z.object({
	title: z.string(),
	subject: z.string(),
	exam_board: z.string(),
	total_marks: z.number().int(),
	duration_minutes: z.number().int(),
	year: z.number().int().nullable().optional(),
	paper_number: z.number().int().nullable().optional(),
})

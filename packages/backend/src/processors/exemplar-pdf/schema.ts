import { z } from "zod/v4"

export const ExemplarSchema = z.object({
	questions: z.array(
		z.object({
			question_text: z.string(),
			exemplars: z.array(
				z.object({
					level: z.number().int(),
					is_fake_exemplar: z.boolean(),
					answer_text: z.string(),
					word_count: z.number().int().optional(),
					why_criteria: z.array(z.string()),
					mark_band: z.string().optional(),
					expected_score: z.number().int().optional(),
				}),
			),
		}),
	),
})

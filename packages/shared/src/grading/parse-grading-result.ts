import { z } from "zod/v4"

/**
 * Zod schema for the serialised GradingResult shape stored in
 * StudentPaperJob.grading_results JSON. Uses snake_case field names.
 *
 * This is the boundary parser — use it when reading grading_results from the DB
 * instead of casting with `as`.
 */
export const GradingResultDbSchema = z.object({
	_v: z.number().optional(), // present on v1+, absent on legacy results
	question_id: z.string(),
	question_number: z.string(),
	question_text: z.string(),
	student_answer: z.string(),
	awarded_score: z.number(),
	max_score: z.number(),
	llm_reasoning: z.string(),
	feedback_summary: z.string(),
	level_awarded: z.number().optional(),
	why_not_next_level: z.string().optional(),
	cap_applied: z.string().optional(),
	what_went_well: z.array(z.string()).optional(),
	even_better_if: z.array(z.string()).optional(),
	mark_points_results: z.array(
		z.object({
			pointNumber: z.number(),
			awarded: z.boolean(),
			reasoning: z.string(),
			expectedCriteria: z.string().optional(),
			studentCovered: z.string().optional(),
		}),
	),
	mark_scheme_id: z.string().nullable(),
})

export type GradingResultDb = z.infer<typeof GradingResultDbSchema>

/**
 * Parse an array of grading results from DB JSON.
 * Returns parsed results, silently dropping any that fail validation.
 */
export function parseGradingResults(raw: unknown): GradingResultDb[] {
	if (!Array.isArray(raw)) return []
	return raw
		.map((item) => GradingResultDbSchema.safeParse(item))
		.filter((r) => r.success)
		.map((r) => r.data)
}

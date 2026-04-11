import { z } from "zod/v4"

const MarkPointSchema = z.object({
	point_number: z
		.number()
		.int()
		.positive()
		.describe("The number of the mark point"),
	description: z.string().describe("Description of the mark point"),
	points: z
		.number()
		.int()
		.positive()
		.describe(
			"Points for this mark point (1 for point-based; can be a range max for LoR)",
		),
	criteria: z.string().describe("Criteria for awarding the mark point"),
})

const MarkingRulesLevelSchema = z.object({
	level: z.number().int().min(1),
	mark_range: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
	descriptor: z.string(),
	ao_requirements: z.array(z.string()).optional(),
})

const MarkingRulesCapSchema = z.object({
	condition: z.string(),
	max_level: z.number().int().optional(),
	max_mark: z.number().int().optional(),
	reason: z.string(),
})

const MarkingRulesSchema = z
	.object({
		command_word: z.string().optional(),
		items_required: z.number().int().positive().optional(),
		levels: z.array(MarkingRulesLevelSchema),
		caps: z.array(MarkingRulesCapSchema).optional(),
	})
	.optional()

export const CreateMarkSchemeSchema = {
	question_id: z
		.string()
		.describe("The ID of the question this mark scheme is for"),
	description: z
		.string()
		.describe("Description of what this mark scheme is for"),
	guidance: z
		.string()
		.optional()
		.describe(
			"Marking guidance for the LLM on how to apply this mark scheme to the question",
		),
	points_total: z
		.number()
		.int()
		.positive()
		.describe("Total number of points for the mark scheme"),
	mark_points: z.array(MarkPointSchema).describe("Array of mark points"),
	marking_method: z
		.enum(["deterministic", "point_based", "level_of_response"])
		.optional()
		.describe(
			"How to mark: deterministic (MCQ), point_based (default), or level_of_response",
		),
	marking_rules: MarkingRulesSchema.describe(
		"For level_of_response: levels, caps, command_word, items_required",
	),
	tags: z
		.array(z.string())
		.optional()
		.describe("Array of tags to categorize and organize the mark scheme"),
}

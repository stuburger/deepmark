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

export const UpdateMarkSchemeSchema = {
	id: z
		.string()
		.describe("The unique identifier for the mark scheme to update"),
	points_total: z
		.number()
		.int()
		.positive()
		.optional()
		.describe("Total number of points for the mark scheme"),
	mark_points: z
		.array(MarkPointSchema)
		.optional()
		.describe("Array of mark points"),
	marking_method: z
		.enum(["deterministic", "point_based", "level_of_response"])
		.optional()
		.describe(
			"How to mark: deterministic (MCQ), point_based, or level_of_response",
		),
	content: z
		.string()
		.optional()
		.describe(
			"The full mark scheme content text (level descriptors, caps, guidance, etc.)",
		),
}

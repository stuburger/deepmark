import { z } from "zod"

export const TestAndRefineMarkSchemeSchema = {
	mark_scheme_id: z.string().describe("ID of the mark scheme to test and refine"),
	target_scores: z
		.array(z.number().int().min(0))
		.optional()
		.describe(
			"Optional: score boundaries to probe (e.g. [1, 5, 10, 15, 20]). Defaults to probed boundaries from total marks.",
		),
	max_iterations: z
		.number()
		.int()
		.min(1)
		.max(10)
		.optional()
		.default(3)
		.describe("Max iterations per target score before moving on"),
}

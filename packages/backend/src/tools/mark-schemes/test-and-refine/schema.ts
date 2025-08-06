import { z } from "zod"

export const TestAndRefineMarkSchemeSchema = {
	mark_scheme_id: z
		.string()
		.describe("ID of the mark scheme to test and refine"),
	test_answers: z
		.array(
			z.object({
				student_answer: z
					.string()
					.min(1)
					.describe("Student answer text for testing"),
				expected_score: z
					.number()
					.min(0)
					.describe("Expected score for this answer"),
				answer_quality: z
					.enum(["excellent", "good", "average", "poor", "fail"])
					.optional()
					.describe("Quality category of this test answer"),
				notes: z
					.string()
					.optional()
					.describe("Optional notes about this test case"),
			}),
		)
		.min(1)
		.describe("Array of test answers with expected scores"),
	accuracy_threshold: z
		.number()
		.min(0)
		.max(100)
		.default(80)
		.describe("Minimum accuracy percentage required (default: 80%)"),
	max_refinement_cycles: z
		.number()
		.min(1)
		.max(10)
		.default(3)
		.describe("Maximum number of refinement cycles to attempt (default: 3)"),
	auto_refine: z
		.boolean()
		.default(true)
		.describe(
			"Whether to automatically refine the mark scheme if accuracy is below threshold",
		),
	preserve_total_marks: z
		.boolean()
		.default(true)
		.describe(
			"Whether to preserve the total marks when refining the mark scheme",
		),
}

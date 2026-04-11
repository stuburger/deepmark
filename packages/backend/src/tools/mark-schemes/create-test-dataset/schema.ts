import { z } from "zod/v4"

export const CreateTestDatasetSchema = {
	question_id: z
		.string()
		.describe("ID of the question to create test dataset for"),
	dataset_name: z
		.string()
		.min(1)
		.describe(
			"Name for this test dataset (e.g., 'Biology Cell Division Test Set')",
		),
	answer_examples: z
		.array(
			z.object({
				student_answer: z.string().min(1).describe("Example student answer"),
				expected_score: z
					.number()
					.min(0)
					.describe("Expected score for this answer"),
				answer_quality: z
					.enum(["excellent", "good", "average", "poor", "fail"])
					.describe("Quality category of this example answer"),
				notes: z
					.string()
					.optional()
					.describe("Optional notes about why this answer gets this score"),
				topic_focus: z
					.string()
					.optional()
					.describe("What aspect of the topic this answer focuses on"),
			}),
		)
		.min(3)
		.max(20)
		.describe("Array of 3-20 example answers with expected scores"),
	generate_additional: z
		.boolean()
		.default(false)
		.describe(
			"Whether to use LLM to generate additional test cases based on the examples",
		),
	additional_count: z
		.number()
		.min(0)
		.max(30)
		.default(10)
		.describe(
			"Number of additional test cases to generate (if generate_additional is true)",
		),
}

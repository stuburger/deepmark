import { z } from "zod"

export const CreateExamPaperSchema = {
	title: z.string().describe("The title of the exam paper"),
	subject: z
		.enum(["biology", "chemistry", "physics", "english"])
		.describe("Subject area for the exam paper"),
	year: z.number().int().positive().describe("The year of the exam paper"),
	paper_number: z
		.number()
		.int()
		.positive()
		.optional()
		.describe("Paper number if there are multiple papers"),
	duration_minutes: z
		.number()
		.int()
		.positive()
		.describe("Duration of the exam in minutes"),
	total_marks: z
		.number()
		.int()
		.positive()
		.describe("Total marks available for the exam paper"),
	metadata: z
		.object({
			difficulty_level: z.enum(["foundation", "higher"]).optional(),
			tier: z.enum(["foundation", "higher"]).optional(),
			season: z.enum(["summer", "autumn", "winter"]).optional(),
		})
		.optional()
		.describe("Optional metadata for the exam paper"),
}

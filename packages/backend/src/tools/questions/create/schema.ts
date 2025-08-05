import { z } from "zod"

export const CreateQuestionPartSchema = z.object({
	part_label: z.string().describe("The part label (e.g., 'a', 'b', 'c')"),
	part_text: z.string().describe("The text for this specific question part"),
	part_points: z
		.number()
		.int()
		.positive()
		.optional()
		.describe(
			"Number of marks for this specific part (optional, defaults to parent question points)",
		),
	part_difficulty_level: z
		.enum(["easy", "medium", "hard", "expert"])
		.optional()
		.describe(
			"Difficulty level for this specific part (optional, defaults to parent question difficulty)",
		),
})

export const CreateQuestionSchema = {
	topic: z
		.string()
		.min(1)
		.describe("The topic or subject matter for the question"),
	question_text: z.string().describe("The exam question"),
	points: z
		.number()
		.int()
		.positive()
		.describe("Number of marks the question is worth"),
	difficulty_level: z
		.enum(["easy", "medium", "hard", "expert"])
		.describe("Difficulty level of the question"),
	subject: z
		.enum(["biology", "chemistry", "physics", "english"])
		.describe("Subject area for the question"),
	question_parts: z.array(CreateQuestionPartSchema),
	// Optional fields for adding question to an exam paper
	exam_paper_id: z
		.string()
		.optional()
		.describe("Optional: ID of the exam paper to add this question to"),
	section_title: z
		.string()
		.optional()
		.describe(
			"Optional: Title of the exam section (defaults to 'Section A' if exam_paper_id is provided)",
		),
	section_order: z
		.number()
		.int()
		.positive()
		.optional()
		.describe(
			"Optional: Order of the question within the section (will be calculated automatically if not provided)",
		),
}

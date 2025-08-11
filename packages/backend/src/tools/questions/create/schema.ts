import { z } from "zod"

export const MultipleChoiceOptionSchema = z.object({
	option_label: z
		.string()
		.describe("The option label (e.g., 'A', 'B', 'C', 'D')"),
	option_text: z.string().describe("The text for this option"),
})

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
	part_question_type: z
		.enum(["written", "multiple_choice"])
		.default("written")
		.describe("Type of question part - written or multiple choice"),
	part_multiple_choice_options: z
		.array(MultipleChoiceOptionSchema)
		.optional()
		.describe(
			"Multiple choice options (required for multiple_choice type questions)",
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
	question_type: z
		.enum(["written", "multiple_choice"])
		.default("written")
		.describe("Type of question - written or multiple choice"),
	multiple_choice_options: z
		.array(MultipleChoiceOptionSchema)
		.optional()
		.describe(
			"Multiple choice options (required for multiple_choice type questions)",
		),
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

export const CreateQuestionResponseSchema = {
	question: z.object({
		id: z.string(),
		created_by: z.object({
			id: z.string(),
			name: z.string().nullable(),
			email: z.string().nullable(),
		}),
	}),
	question_type: z.string(),
	multiple_choice_options: z
		.array(
			z.object({
				option_label: z.string(),
				option_text: z.string(),
			}),
		)
		.optional(),
	exam_section_info: z
		.object({
			exam_paper_title: z.string(),
			section_title: z.string(),
			question_order: z.number(),
		})
		.optional(),
}

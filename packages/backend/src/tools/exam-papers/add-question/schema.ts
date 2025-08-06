import { z } from "zod"

export const AddQuestionToExamPaperSchema = {
	exam_paper_id: z
		.string()
		.describe("ID of the exam paper to add the question to"),
	question_id: z
		.string()
		.describe("ID of the existing question to add to the exam paper"),
	section_title: z
		.string()
		.optional()
		.describe(
			"Optional: Title of the exam section (defaults to 'Section A' if not provided)",
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

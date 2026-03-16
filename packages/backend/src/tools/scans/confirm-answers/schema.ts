import { z } from "zod"

export const ConfirmScanAnswersSchema = {
	scan_submission_id: z
		.string()
		.min(1)
		.describe("ID of the scan submission to confirm and create answers from"),
	corrections: z
		.array(
			z.object({
				extracted_answer_id: z.string().min(1),
				corrected_text: z.string(),
			}),
		)
		.optional()
		.default([])
		.describe(
			"Optional list of { extracted_answer_id, corrected_text } to override extracted text before creating answers",
		),
}

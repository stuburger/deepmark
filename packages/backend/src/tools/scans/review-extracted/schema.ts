import { z } from "zod"

export const ReviewExtractedAnswersSchema = {
	scan_submission_id: z
		.string()
		.min(1)
		.describe("ID of the scan submission whose extracted answers to review"),
}

import { z } from "zod"

export const GetScanSubmissionSchema = {
	scan_submission_id: z
		.string()
		.min(1)
		.describe("ID of the scan submission to fetch"),
}

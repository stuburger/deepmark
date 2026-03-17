import { z } from "zod"

export const CreateScanSubmissionSchema = {
	exam_paper_id: z
		.string()
		.min(1)
		.describe("ID of the exam paper this scan belongs to"),
	page_count: z
		.number()
		.int()
		.min(1)
		.max(100)
		.describe("Number of scan pages (images) to upload"),
	mime_type: z
		.enum(["image/jpeg", "image/png", "image/webp"])
		.optional()
		.default("image/jpeg")
		.describe("MIME type of the page images (default image/jpeg)"),
}

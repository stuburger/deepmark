import { z } from "zod/v4"

export const AnalyzeHandwritingSchema = {
	image_base64: z
		.string()
		.min(1)
		.describe(
			"Base64-encoded JPEG image of the handwritten content (without data: URI prefix)",
		),
	mime_type: z
		.enum(["image/jpeg", "image/png", "image/webp"])
		.optional()
		.default("image/jpeg")
		.describe("MIME type of the image (defaults to image/jpeg)"),
	analysis_focus: z
		.string()
		.optional()
		.describe(
			"Optional focus for the analysis, e.g. 'spelling errors', 'letter formation', 'corrections', 'sentence structure'",
		),
}

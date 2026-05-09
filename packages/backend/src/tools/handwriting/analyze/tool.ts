import { comprehendPage } from "@/lib/scan-extraction/comprehend-page"
import { tool } from "@/tools/shared/tool-utils"
import { AnalyzeHandwritingSchema } from "./schema"

export const handler = tool(AnalyzeHandwritingSchema, async (args) => {
	const { image_base64, mime_type = "image/jpeg", analysis_focus } = args

	const analysis = await comprehendPage(image_base64, mime_type, {
		analysisFocus: analysis_focus,
	})

	const observationLines = analysis.observations.map((o) => `  • ${o}`)

	const separator = "─".repeat(48)

	return [
		"HANDWRITING TRANSCRIPT",
		separator,
		analysis.transcript,
		"",
		"HANDWRITING OBSERVATIONS",
		separator,
		...observationLines,
	].join("\n")
})

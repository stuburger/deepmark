import { tool } from "@/tools/shared/tool-utils"
import { runOcr } from "@/lib/scan-extraction/gemini-ocr"
import { AnalyzeHandwritingSchema } from "./schema"

export const handler = tool(AnalyzeHandwritingSchema, async (args) => {
	const { image_base64, mime_type = "image/jpeg", analysis_focus } = args

	const analysis = await runOcr(image_base64, mime_type, {
		analysisFocus: analysis_focus,
	})

	const featureLines = analysis.features.map((f) => {
		const [yMin, xMin, yMax, xMax] = f.box_2d
		return `  [${f.feature_type}] "${f.label}" — bbox(y: ${yMin}–${yMax}, x: ${xMin}–${xMax})`
	})

	const observationLines = analysis.observations.map((o) => `  • ${o}`)

	const separator = "─".repeat(48)

	return [
		"HANDWRITING TRANSCRIPT",
		separator,
		analysis.transcript,
		"",
		`DETECTED FEATURES (${analysis.features.length})`,
		separator,
		...featureLines,
		"",
		"HANDWRITING OBSERVATIONS",
		separator,
		...observationLines,
		"",
		"RAW ANALYSIS (JSON)",
		separator,
		JSON.stringify(analysis, null, 2),
	].join("\n")
})

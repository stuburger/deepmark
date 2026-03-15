import { GoogleGenAI, Type } from "@google/genai"
import { Resource } from "sst"
import { tool } from "@/tools/shared/tool-utils"
import { AnalyzeHandwritingSchema } from "./schema"

const client = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })

type HandwritingFeature = {
	box_2d: [number, number, number, number]
	label: string
	feature_type: string
}

type HandwritingAnalysis = {
	transcript: string
	features: HandwritingFeature[]
	observations: string[]
}

const RESPONSE_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		transcript: {
			type: Type.STRING,
			description:
				"Full transcription of all handwritten text in reading order",
		},
		features: {
			type: Type.ARRAY,
			description: "Bounding box annotations for detected text features",
			items: {
				type: Type.OBJECT,
				properties: {
					box_2d: {
						type: Type.ARRAY,
						description:
							"Bounding box coordinates [y_min, x_min, y_max, x_max] normalized 0-1000",
						items: { type: Type.INTEGER, format: "int32" },
						minItems: "4",
						maxItems: "4",
					},
					label: {
						type: Type.STRING,
						description: "Text content or description of this region",
					},
					feature_type: {
						type: Type.STRING,
						description:
							"Type of feature: word, line, paragraph, correction, crossing-out, diagram, punctuation",
					},
				},
				required: ["box_2d", "label", "feature_type"],
			},
		},
		observations: {
			type: Type.ARRAY,
			description:
				"Observations about handwriting style, legibility, and notable characteristics",
			items: { type: Type.STRING },
		},
	},
	required: ["transcript", "features", "observations"],
}

export const handler = tool(AnalyzeHandwritingSchema, async (args) => {
	const { image_base64, mime_type = "image/jpeg", analysis_focus } = args

	const focusInstruction = analysis_focus
		? `Focus specifically on: ${analysis_focus}.`
		: "Identify individual words, lines, corrections, crossed-out text, punctuation, and any notable handwriting characteristics."

	const response = await client.models.generateContent({
		model: "gemini-2.0-flash",
		contents: [
			{
				role: "user",
				parts: [
					{
						inlineData: {
							data: image_base64,
							mimeType: mime_type,
						},
					},
					{
						text: `Transcribe all handwritten text and identify bounding boxes for key features. ${focusInstruction} Return bounding box coordinates normalized to 0-1000 where (0,0) is the top-left corner.`,
					},
				],
			},
		],
		config: {
			systemInstruction:
				"You are an expert at analysing handwritten text. When given a handwriting image, provide: a full transcript of all text, bounding boxes for each detected feature, and observations about the handwriting quality and style. Limit to 50 bounding box features.",
			responseMimeType: "application/json",
			responseSchema: RESPONSE_SCHEMA,
			temperature: 0.2,
		},
	})

	const responseText = response.text
	if (!responseText) {
		throw new Error("No response received from Gemini API")
	}

	const analysis = JSON.parse(responseText) as HandwritingAnalysis

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

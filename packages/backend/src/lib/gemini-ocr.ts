import { GoogleGenAI, Type } from "@google/genai"
import { Resource } from "sst"

export type HandwritingFeature = {
	box_2d: [number, number, number, number]
	label: string
	feature_type: string
}

export type HandwritingAnalysis = {
	transcript: string
	features: HandwritingFeature[]
	observations: string[]
}

export type RunOcrOptions = {
	analysisFocus?: string
}

// Transcript and observations — wrapped OBJECT schema.
const TRANSCRIPT_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		transcript: {
			type: Type.STRING,
			description: "Full transcription of all handwritten text in reading order",
		},
		observations: {
			type: Type.ARRAY,
			description: "Observations about handwriting style, legibility, and notable characteristics",
			items: { type: Type.STRING },
		},
	},
	required: ["transcript", "observations"],
}

// Bounding boxes — TOP-LEVEL ARRAY schema following the Google Gemini docs
// pattern for spatial object detection. Keeping bounding boxes in their own
// dedicated call with a flat array schema produces more accurate coordinates
// than nesting them inside a wrapper object schema.
const BOUNDING_BOX_SCHEMA = {
	type: Type.ARRAY,
	description: "Bounding boxes for all detected handwritten text regions",
	items: {
		type: Type.OBJECT,
		properties: {
			box_2d: {
				type: Type.ARRAY,
				description: "Bounding box coordinates [y_min, x_min, y_max, x_max] normalized 0-1000",
				items: { type: Type.INTEGER, format: "int32" },
				minItems: "4",
				maxItems: "4",
			},
			label: {
				type: Type.STRING,
				description: "Exact text content or description within this bounding box",
			},
			feature_type: {
				type: Type.STRING,
				description:
					"Type of feature: word, line, paragraph, correction, crossing-out, diagram, punctuation",
			},
		},
		required: ["box_2d", "label", "feature_type"],
	},
}

/**
 * Run Gemini OCR with bounding box detection on a base64-encoded image.
 *
 * Two parallel calls are made:
 *  1. Transcript + observations — structured OBJECT output.
 *  2. Bounding boxes — dedicated top-level ARRAY output following the Google
 *     docs spatial-detection pattern, which gives more accurate coordinates
 *     than asking for boxes inside a wrapper object schema.
 */
export async function runOcr(
	imageBase64: string,
	mimeType: string,
	options: RunOcrOptions = {},
): Promise<HandwritingAnalysis> {
	const ai = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })
	const imagePart = { inlineData: { data: imageBase64, mimeType } }

	const focusInstruction = options.analysisFocus
		? `Focus specifically on: ${options.analysisFocus}.`
		: "Cover individual words, lines, corrections, crossed-out text, punctuation, and any diagrams."

	const [transcriptResponse, bboxResponse] = await Promise.all([
		ai.models.generateContent({
			model: "gemini-2.5-flash",
			contents: [
				{
					role: "user",
					parts: [
						imagePart,
						{
							text: `Transcribe all handwritten text in reading order and provide observations about the handwriting quality and style. ${focusInstruction}`,
						},
					],
				},
			],
			config: {
				systemInstruction:
					"You are an expert at analysing handwritten text. Provide a full transcript and concise observations.",
				responseMimeType: "application/json",
				responseSchema: TRANSCRIPT_SCHEMA,
				temperature: 0.2,
			},
		}),

		ai.models.generateContent({
			model: "gemini-2.5-flash",
			contents: [
				{
					role: "user",
					parts: [
						imagePart,
						{
							text: `Detect all handwritten text regions with precise bounding boxes. ${focusInstruction} Limit to 50 regions.`,
						},
					],
				},
			],
			config: {
				systemInstruction: `Return bounding boxes as an array with labels. Never return masks or code fencing. Limit to 50 objects.
For each region include the exact text content as the label and a feature_type (word, line, paragraph, correction, crossing-out, diagram, or punctuation).`,
				responseMimeType: "application/json",
				responseSchema: BOUNDING_BOX_SCHEMA,
				temperature: 0.5,
			},
		}),
	])

	const transcriptText = transcriptResponse.candidates?.[0]?.content?.parts?.[0]?.text
	const bboxText = bboxResponse.candidates?.[0]?.content?.parts?.[0]?.text

	if (!transcriptText) throw new Error("No transcript response from Gemini")
	if (!bboxText) throw new Error("No bounding box response from Gemini")

	const { transcript, observations } = JSON.parse(transcriptText) as {
		transcript: string
		observations: string[]
	}

	const features = JSON.parse(bboxText) as HandwritingFeature[]

	return { transcript, observations, features }
}

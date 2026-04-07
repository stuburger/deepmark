import { GoogleGenAI, Type } from "@google/genai"
import { Resource } from "sst"

export type HandwritingAnalysis = {
	transcript: string
	observations: string[]
}

export type RunOcrOptions = {
	analysisFocus?: string
}

const TRANSCRIPT_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		transcript: {
			type: Type.STRING,
			description:
				"Full transcription of all handwritten text in reading order",
		},
		observations: {
			type: Type.ARRAY,
			description:
				"Observations about handwriting style, legibility, and notable characteristics",
			items: { type: Type.STRING },
		},
	},
	required: ["transcript", "observations"],
}

/**
 * Run Gemini OCR on a base64-encoded image to get a full transcript and
 * handwriting observations. Precise word-level bounding boxes are obtained
 * separately via Cloud Vision (cloud-vision-ocr.ts).
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

	const response = await ai.models.generateContent({
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
	})

	const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text
	if (!responseText) throw new Error("No transcript response from Gemini")

	const { transcript, observations } = JSON.parse(responseText) as {
		transcript: string
		observations: string[]
	}

	return { transcript, observations }
}

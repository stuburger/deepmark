import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import type { LlmRunner } from "@mcp-gcse/shared"
import { type LanguageModel, Output, generateText } from "ai"
import { z } from "zod"

export type HandwritingAnalysis = {
	transcript: string
	observations: string[]
}

export type RunOcrOptions = {
	analysisFocus?: string
}

const TranscriptSchema = z.object({
	transcript: z
		.string()
		.describe("Full transcription of all handwritten text in reading order"),
	observations: z
		.array(z.string())
		.describe(
			"Observations about handwriting style, legibility, and notable characteristics",
		),
})

/**
 * Run LLM OCR on a base64-encoded image to get a full transcript and
 * handwriting observations. Precise word-level bounding boxes are obtained
 * separately via Cloud Vision (cloud-vision-ocr.ts).
 */
export async function runOcr(
	imageBase64: string,
	mimeType: string,
	options: RunOcrOptions = {},
	llm?: LlmRunner,
): Promise<HandwritingAnalysis> {
	const focusInstruction = options.analysisFocus
		? `Focus specifically on: ${options.analysisFocus}.`
		: "Cover individual words, lines, corrections, crossed-out text, punctuation, and any diagrams."

	const callFn = async (model: LanguageModel, entry: { temperature: number }) =>
		generateText({
			model,
			temperature: entry.temperature,
			system:
				"You are an expert at analysing handwritten text. Provide a full transcript and concise observations.",
			messages: [
				{
					role: "user",
					content: [
						{
							type: "image",
							image: imageBase64,
							mediaType: mimeType,
						},
						{
							type: "text",
							text: `Transcribe all handwritten text in reading order and provide observations about the handwriting quality and style. ${focusInstruction}`,
						},
					],
				},
			],
			output: Output.object({ schema: TranscriptSchema }),
		})

	const { output } = llm
		? await llm.call("handwriting-ocr", callFn)
		: await callLlmWithFallback("handwriting-ocr", callFn)

	return { transcript: output.transcript, observations: output.observations }
}

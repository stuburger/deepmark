import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import type { LlmRunner } from "@mcp-gcse/shared"
import { generateText } from "ai"
import { outputSchema } from "@/lib/infra/output-schema"
import { z } from "zod/v4"

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

	const { output } = await callLlmWithFallback(
		"handwriting-ocr",
		async (model, entry, report) => {
			const result = await generateText({
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
				output: outputSchema(TranscriptSchema),
			})
			report.usage = result.usage
			return result
		},
		llm,
	)

	return { transcript: output.transcript, observations: output.observations }
}

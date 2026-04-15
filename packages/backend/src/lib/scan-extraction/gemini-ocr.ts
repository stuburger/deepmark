import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import { outputSchema } from "@/lib/infra/output-schema"
import type { LlmRunner } from "@mcp-gcse/shared"
import { generateText } from "ai"
import { z } from "zod/v4"

export type HandwritingAnalysis = {
	transcript: string
	observations: string[]
	studentName?: string | null
	detectedSubject?: string | null
}

export type RunOcrOptions = {
	analysisFocus?: string
	/** When true, also extract student name and detected subject. Use only for the first page. */
	extractMetadata?: boolean
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
	student_name: z
		.string()
		.nullable()
		.optional()
		.describe("Student's name if visible on the page, null if not found"),
	detected_subject: z
		.string()
		.nullable()
		.optional()
		.describe(
			"Exam subject as a lowercase single word (e.g. biology, business, mathematics), null if unclear",
		),
})

/**
 * Run LLM OCR on a base64-encoded image to get a full transcript and
 * handwriting observations. Precise word-level bounding boxes are obtained
 * separately via Cloud Vision (cloud-vision-ocr.ts).
 *
 * Pass `extractMetadata: true` for the first page to also extract student name
 * and detected subject.
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

	const metadataInstruction = options.extractMetadata
		? " Also extract the student's name if visible, and detect the exam subject (as a lowercase single word) from headers or content."
		: ""

	const { output } = await callLlmWithFallback(
		"handwriting-ocr",
		async (model, entry, report) => {
			const result = await generateText({
				model,
				temperature: entry.temperature,
				system:
					"You are an expert at reading handwritten student exam scripts. " +
					"Transcribe all text accurately. " +
					"When letterforms are ambiguous, use English vocabulary and context to resolve to the most likely intended word — " +
					"output 'method' not 'methoed', 'loyalty' not 'loyaltty', 'therefore' not 'therfore'. " +
					"Preserve genuine student spelling errors that are consistently and clearly misspelled " +
					"(e.g. 'bensfit' for 'benefit') since these reflect the student's own writing and matter for marking.",
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
								text: `Transcribe all handwritten text in reading order and provide observations about the handwriting quality and style. ${focusInstruction}${metadataInstruction}`,
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

	return {
		transcript: output.transcript,
		observations: output.observations,
		studentName: output.student_name ?? null,
		detectedSubject: output.detected_subject ?? null,
	}
}

import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import { outputSchema } from "@/lib/infra/output-schema"
import type { LlmRunner, LlmTimeoutMs } from "@mcp-gcse/shared"
import { generateText } from "ai"
import { z } from "zod/v4"

export type HandwritingAnalysis = {
	transcript: string
	observations: string[]
	studentName?: string | null
	studentNumber?: string | null
	detectedSubject?: string | null
}

export type ComprehendPageOptions = {
	analysisFocus?: string
	/** When true, also extract student name and detected subject. Use only for the first page. */
	extractMetadata?: boolean
	/** Per-attempt wall-clock budget forwarded to the runner. */
	timeoutMs?: LlmTimeoutMs
}

const TranscriptSchema = z.object({
	transcript: z
		.string()
		.describe(
			"Full transcription of all student-authored text on the page in reading order — whether handwritten or typed inline. Include only what the student wrote/typed in response to the questions; exclude printed exam content (question stems, instructions, headers, footers, page numbers).",
		),
	observations: z
		.array(z.string())
		.describe(
			"Observations about the student's writing — style, legibility, modality (handwritten or typed), and notable characteristics.",
		),
	student_name: z
		.string()
		.nullable()
		.optional()
		.describe(
			"Student's name if visible on the page (handwritten or typed), null if not found",
		),
	student_number: z
		.string()
		.nullable()
		.optional()
		.describe(
			"Student identifier near the name/header area (handwritten or typed). Typical shapes: a 1-2 letter prefix + dash + digits (e.g. 'S-042', 'T-12'), or plain digits (e.g. '042'). Return the value verbatim including any prefix/dash. Do NOT confuse with question numbers, marks, dates, or paper reference codes. Null if no clear student identifier is visible.",
		),
	detected_subject: z
		.string()
		.nullable()
		.optional()
		.describe(
			"Exam subject as a lowercase single word (e.g. biology, business, mathematics), null if unclear",
		),
})

/**
 * Comprehend a single page image — read it as a literate human would.
 *
 * The vision LLM produces:
 *   - a clean reading-order transcript of all handwritten text,
 *   - observations about handwriting style/legibility,
 *   - (first page only) the student's handwritten name, ID number, and the
 *     detected exam subject.
 *
 * This is the comprehension layer above Cloud Vision: Cloud Vision
 * (`cloud-vision-ocr.ts`) returns word-level positions and characters but no
 * understanding of meaning, identity, or content type. This call provides
 * that semantic layer — its transcript feeds `attributeScript` as a
 * per-page semantic guide; its first-page metadata seeds the submission
 * record so the teacher doesn't have to type names by hand.
 *
 * Pass `extractMetadata: true` for the first page to also extract student
 * name, ID number, and detected subject.
 */
export async function comprehendPage(
	imageBase64: string,
	mimeType: string,
	options: ComprehendPageOptions = {},
	llm?: LlmRunner,
): Promise<HandwritingAnalysis> {
	const focusInstruction = options.analysisFocus
		? `Focus specifically on: ${options.analysisFocus}.`
		: "Cover individual words, lines, corrections, crossed-out text, punctuation, and any diagrams."

	const metadataInstruction = options.extractMetadata
		? " Also extract the student's name if visible (handwritten or typed), the student's ID number if any (e.g. 'S-042', 'T-12', '042') usually in the header area near the name — distinct from question numbers, marks, or paper reference codes — and detect the exam subject (as a lowercase single word) from headers or content."
		: ""

	const { output } = await callLlmWithFallback(
		"page-comprehension",
		async (model, entry, report, signal) => {
			const result = await generateText({
				model,
				abortSignal: signal,
				temperature: entry.temperature,
				system:
					"You are an expert at reading student exam scripts. The student's answer may be HANDWRITTEN or TYPED inline on the page (e.g. typed directly onto the question paper for homework, mock submissions, or accessibility). Treat both modalities the same way — distinguish the student's answer from printed exam content (question stems, instructions, headers, footers) by CONTENT and POSITION, not by whether it is handwritten or typed. " +
					"Transcribe all student-authored text accurately. " +
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
								text: `Transcribe the student's text on this page in reading order — whether handwritten or typed inline — and provide observations about its style and legibility. Exclude printed exam content (question stems, instructions, headers, footers). ${focusInstruction}${metadataInstruction}`,
							},
						],
					},
				],
				output: outputSchema(TranscriptSchema),
			})
			report.usage = result.usage
			return result
		},
		{ llm, timeoutMs: options.timeoutMs },
	)

	return {
		transcript: output.transcript,
		observations: output.observations,
		studentName: output.student_name ?? null,
		studentNumber: output.student_number?.trim() || null,
		detectedSubject: output.detected_subject ?? null,
	}
}

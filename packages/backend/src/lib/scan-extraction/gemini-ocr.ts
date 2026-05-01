import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import { outputSchema } from "@/lib/infra/output-schema"
import type { LlmRunner } from "@mcp-gcse/shared"
import { generateText } from "ai"
import { z } from "zod/v4"
import { normalizeMcqLabel } from "./normalize-mcq-label"

export type OcrMcqSelection = {
	question_number: string
	selected_labels: string[]
	mark_description: string
}

/**
 * Per-page classification of which questions have answer content visible.
 * Used by the attribution step as a candidate shortlist per page — greatly
 * reducing ambiguity on continuation pages (no visible question number, but
 * OCR can infer the question from context).
 */
export type OcrQuestionOnPage = {
	question_number: string
	content_type: "fresh_start" | "continuation"
}

export type HandwritingAnalysis = {
	transcript: string
	observations: string[]
	studentName?: string | null
	detectedSubject?: string | null
	mcqSelections: OcrMcqSelection[]
	questionsOnPage: OcrQuestionOnPage[]
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
	mcq_selections: z
		.array(
			z.object({
				question_number: z
					.string()
					.describe("The MCQ question number as printed, e.g. '01.1'"),
				selected_labels: z
					.array(z.string())
					.describe(
						"Option letter(s) ONLY, e.g. ['C'] or ['A','B'] for multi-select. NEVER include the option's text — ['C - Farming'] and ['Farming'] are both wrong; the correct value is ['C']. Empty array if the selection cannot be determined.",
					),
				mark_description: z
					.string()
					.describe(
						"Brief description of how the choice was marked, e.g. 'cross in checkbox C', 'circled letter A', 'handwritten B'.",
					),
			}),
		)
		.optional()
		.describe(
			"MCQ selections identified on this page. One entry per MCQ the student answered on this page, however they indicated their choice (tick, cross, circle, fill, or handwritten letter). Omit MCQs not answered on this page.",
		),
	questions_on_page: z
		.array(
			z.object({
				question_number: z
					.string()
					.describe(
						"The question number whose answer content is visible on this page, e.g. '01.1', '02', '2b'.",
					),
				content_type: z
					.enum(["fresh_start", "continuation"])
					.describe(
						"'fresh_start' = the question number label is visible on this page (e.g. '02)' at the top of the answer, or the page begins a new answer). 'continuation' = this page continues an answer from the previous page with NO visible question number label — the text simply flows on from before.",
					),
			}),
		)
		.optional()
		.describe(
			"Which exam questions have answer content visible on this page. Include every question whose answer (even partial) appears on the page. For each, set content_type honestly: 'fresh_start' when the question number is printed/written on this page, 'continuation' when the page begins mid-answer. Omit MCQ questions here — they're captured in mcq_selections. If the page has no answer content (e.g. cover page, blank page), return an empty array.",
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
								text: `Transcribe all handwritten text in reading order and provide observations about the handwriting quality and style. ${focusInstruction}${metadataInstruction} If this page contains any multiple-choice questions, identify each one's question number and the option letter(s) the student selected — however the choice is indicated (tick or cross in a checkbox, circled letter, circled option text, filled-in box, or handwritten letter on blank space). Return ONLY the letter(s), e.g. selected_labels: ['C'] or ['A','B'] for multi-select. Do NOT include the option's text — ['C - Farming'] or ['Farming'] are wrong; the correct value is ['C']. Also classify which non-MCQ questions have answer content on this page: include those whose question number label is visible (content_type='fresh_start') AND those where the page continues an answer from the previous page with no visible question label (content_type='continuation').`,
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
		mcqSelections: (output.mcq_selections ?? []).map((s) => ({
			question_number: s.question_number,
			selected_labels: s.selected_labels
				.map(normalizeMcqLabel)
				.filter((l) => l.length > 0),
			mark_description: s.mark_description,
		})),
		questionsOnPage: (output.questions_on_page ?? []).map((q) => ({
			question_number: q.question_number,
			content_type: q.content_type,
		})),
	}
}

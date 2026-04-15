import { z } from "zod/v4"

export const AttributionSchema = z.object({
	assignments: z
		.array(
			z.object({
				question_id: z
					.string()
					.describe("The question_id as provided in the question list"),
				token_indices: z
					.array(z.number())
					.describe(
						"The 0-based indices of every token that belongs to this question's answer. List each index individually — do NOT include question number labels, only the actual answer content.",
					),
			}),
		)
		.describe(
			"For each question answered on this page, list the individual token indices that belong to the student's answer",
		),
	corrections: z
		.array(
			z.object({
				token_index: z
					.number()
					.describe("0-based index of the token from the input list"),
				corrected: z
					.string()
					.describe(
						"The correct word — use the transcript as reference, confirm visually from the image",
					),
			}),
		)
		.describe(
			"Tokens where Cloud Vision misread the handwriting. Compare each token against the transcript. If Vision clearly got a word wrong (e.g. Vision says 'Suly', transcript says 'Sales'), include a correction. Skip tokens Vision read correctly. Do NOT correct genuine student spelling mistakes — only fix Vision OCR failures.",
		),
})

export const McqFallbackSchema = z.object({
	regions: z.array(
		z.object({
			question_id: z.string(),
			box: z
				.array(z.number())
				.describe(
					"[yMin, xMin, yMax, xMax] normalised 0–1000 around the selected option",
				),
			found: z.boolean(),
		}),
	),
})

/**
 * Builds the attribution prompt for a single page.
 *
 * Tokens are serialised as compact [index,"word"] tuples rather than one line
 * per token, saving ~40–50% of prompt tokens on dense pages.
 *
 * The page transcript is included as:
 * 1. A context anchor for locating short/numeric answers.
 * 2. The reference for OCR correction — Vision misreads are corrected against it.
 */
export function buildAttributionPrompt(
	tokenList: string,
	questionsText: string,
	pageTranscript: string,
): string {
	return `You are examining a student's handwritten exam answer script.

Below is a list of words (tokens) detected by OCR on this page, as [index,"word"] tuples in reading order:
${tokenList}

Page transcript — a clean reading of the same page (use as the authoritative reference for what was actually written):
${pageTranscript}

The exam contains these questions:
${questionsText}

Do TWO things:

1. ASSIGN tokens to questions:
   - For each question answered on this page, list the token indices belonging to the student's answer.
   - EXCLUDE question number labels (e.g. "01.5", "Q2", "1.6)") — only the answer content.
   - List every index individually. Use the image to confirm where each answer starts and ends.
   - For long answers, include ALL tokens. Include crossing-out and corrections.
   - Omit questions with no answer on this page.

2. CORRECT OCR misreads:
   - Compare each token's text against the transcript.
   - If Vision clearly misread a word (e.g. Vision "Suly", transcript "Sales"), provide the correction.
   - Use the image to visually confirm the actual word when uncertain.
   - Do NOT correct genuine student spelling errors — only fix Vision OCR failures.
   - Skip tokens Vision read correctly.`
}

export function buildMcqFallbackPrompt(questionsText: string): string {
	return `You are examining a student's handwritten multiple-choice exam script. The image shows one page.

The following MCQ questions may have been answered on this page. The student selected their answer by circling, ticking, or writing next to an option letter:
${questionsText}

For each question answered on this page, draw a tight bounding box around the selected option or written letter. If a question is not answered on this page, set found to false and use [0,0,0,0].

Return bounding box coordinates as [yMin, xMin, yMax, xMax] normalised 0–1000.`
}

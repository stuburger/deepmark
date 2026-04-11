import { z } from "zod/v4"

export const AttributionSchema = z.object({
	assignments: z
		.array(
			z.object({
				question_id: z
					.string()
					.describe("The question_id as provided in the question list"),
				ranges: z
					.array(
						z.object({
							start: z
								.number()
								.describe("First token index as an integer (0-based, inclusive)"),
							end: z
								.number()
								.describe("Last token index as an integer (0-based, inclusive)"),
						}),
					)
					.describe(
						"Contiguous token ranges for this question's answer. Use multiple ranges if the answer is non-contiguous. Each range is [start, end] inclusive (0-based).",
					),
			}),
		)
		.describe(
			"For each question answered on this page, provide one or more token ranges that cover the full extent of the student's answer",
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

export function buildAttributionPrompt(
	tokenList: string,
	questionsText: string,
): string {
	return `You are examining a student's handwritten exam answer script. The image above shows one page of the script.

Below is a list of words (tokens) detected by OCR on this page, numbered 0-based in reading order:
${tokenList}

The exam contains these questions (with the student's already-extracted answer text shown as a matching anchor):
${questionsText}

For each question answered on this page, identify the FULL extent of the student's ANSWER TEXT using token ranges [start, end].

IMPORTANT:
- EXCLUDE question number labels (e.g. "01.5", "Q2", "1.6)") from the ranges — only include the actual answer content the student wrote. The answer region should start at the first word of the response, not at the question number.
- Use the image to visually confirm where each answer starts and ends on the page.
- Use the extracted answer text as a matching guide — especially for short/numeric answers where OCR tokens may be garbled.
- For long answers that span many lines, the range end must cover ALL the answer tokens, not just the opening lines. If an answer fills most of the page, the range end should be near the last token.
- Include crossing-out, corrections, and continuation text in the range.
- Use multiple ranges only if an answer is genuinely non-contiguous (e.g. a MCQ letter near its question number).
- Omit questions that have no answer on this page.`
}

export function buildMcqFallbackPrompt(questionsText: string): string {
	return `You are examining a student's handwritten multiple-choice exam script. The image shows one page.

The following MCQ questions may have been answered on this page. The student selected their answer by circling, ticking, or writing next to an option letter:
${questionsText}

For each question answered on this page, draw a tight bounding box around the selected option or written letter. If a question is not answered on this page, set found to false and use [0,0,0,0].

Return bounding box coordinates as [yMin, xMin, yMax, xMax] normalised 0–1000.`
}

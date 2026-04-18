import { z } from "zod/v4"

/**
 * Output schema for the script-level attribution LLM call.
 *
 * Attribution is expressed as token-INDEX RANGES per page, not bboxes. Ranges
 * are `[token_start, token_end)` — half-open — over the page's reading-order
 * token list (0-based, reset at each page boundary).
 *
 * Ranges on the same page must be pairwise disjoint across questions. This is
 * enforced by post-parse validation (overlap → reject + retry).
 */
export const ScriptAttributionSchema = z.object({
	answer_spans: z
		.array(
			z.object({
				question_id: z
					.string()
					.describe("The question_id exactly as provided in the question list"),
				pages: z
					.array(
						z.object({
							page: z
								.number()
								.describe(
									"Page number (1-based, matches the page labels in the prompt)",
								),
							token_start: z
								.number()
								.describe(
									"Inclusive start index into the page's token list (0-based, page-local)",
								),
							token_end: z
								.number()
								.describe(
									"Exclusive end index into the page's token list. token_end > token_start. Ranges on the same page MUST NOT overlap across questions.",
								),
						}),
					)
					.describe(
						"One entry per page this answer appears on. A multi-page (continuation) answer has one entry per page it spans.",
					),
				answer_text: z
					.string()
					.describe(
						"The student's complete answer text for this question, concatenated across all pages it spans, in reading order. PRESERVE original punctuation (-, =, +, commas, full stops, etc.) and mathematical symbols exactly as the student wrote them — read them from the image and transcript, not from the OCR token list (which often drops punctuation). Include line breaks between paragraphs as '\\n'. Do NOT include printed exam text (question labels, stems, headers, footers).",
					),
			}),
		)
		.describe(
			"For every question the student ANSWERED, the token ranges that contain the student's handwritten answer and the clean answer text. Omit questions with no answer anywhere in the script. Omit pages where this question is not answered.",
		),
	corrections: z
		.array(
			z.object({
				page: z.number().describe("Page number (1-based)"),
				token_index: z
					.number()
					.describe("0-based page-local index of the token to correct"),
				corrected: z
					.string()
					.describe(
						"The correct word as written by the student, read from the image. Use the page transcript as a reference.",
					),
			}),
		)
		.describe(
			"Tokens where Cloud Vision misread the handwriting. Compare each token against the transcript; include a correction only where Vision clearly got a word wrong. Do NOT correct genuine student spelling mistakes — only Vision OCR failures.",
		)
		.optional(),
})

export type ScriptAttributionOutput = z.infer<typeof ScriptAttributionSchema>

export type PagePromptBlock = {
	order: number
	tokenList: string
	transcript: string
}

export function buildScriptAttributionPrompt({
	pageBlocks,
	questionsText,
	retryFeedback,
}: {
	pageBlocks: PagePromptBlock[]
	questionsText: string
	retryFeedback?: string
}): string {
	const pageSections = pageBlocks
		.map(
			(b) =>
				`=== PAGE ${b.order} ===
Transcript (clean reading of this page):
${b.transcript || "(no transcript)"}

Tokens as [index,"word"] tuples in reading order (indices are 0-based, LOCAL to this page):
${b.tokenList || "(no tokens)"}`,
		)
		.join("\n\n")

	const header = retryFeedback
		? `Your previous response was rejected for the following reason(s):
${retryFeedback}

Return a corrected response that fixes the problem. Keep everything else the same.

`
		: ""

	return `${header}You are examining a student's complete handwritten exam script. It has ${pageBlocks.length} page(s), provided below both as images (attached in order) and as per-page OCR token lists.

You must attribute the student's handwritten answers to the exam's questions — reasoning about the WHOLE script at once, not page by page. Many answers span multiple pages; mid-sentence continuation pages often have NO visible question label and must be inferred from the semantic flow of the student's argument.

${pageSections}

The exam contains these questions:
${questionsText}

Do THREE things:

1. ASSIGN tokens to questions (holistic, whole-script reasoning):
   - For each question the student answered, return one entry per page the answer appears on, with \`[token_start, token_end)\` — a half-open range over that page's token list.
   - A single answer that spans pages (continuation) must have one range on EACH page it covers — including pure continuation pages with no visible question label.
   - Reason from CONTENT, not just labels:
     • Use printed question numbers when visible.
     • When a page has no visible label, infer which open answer it continues from the semantic flow, argument structure, and layout of the handwriting.
     • Printed exam text (question stems, instructions, page headers/footers, "END OF QUESTIONS", "X | Page") is NOT part of any answer — leave those tokens outside every range.
     • Cover pages, blank pages, and template-only pages contain NO ranges at all.
   - Ranges on the SAME page must be pairwise DISJOINT. For any two ranges on the same page, \`token_end\` of the earlier range must be less than or equal to \`token_start\` of the later range. A single token index may appear in at most ONE range. Examples:
     • Valid (adjacent, no overlap):   Q1 [0,10), Q2 [10,25), Q3 [25,40)
     • INVALID (overlap by 1 at 10):   Q1 [0,11), Q2 [10,25)
     • INVALID (one range inside another): Q1 [0,100), Q2 [50,80)
   - When two answers sit next to each other on a page, pick the exact index where the previous answer ends and the next begins — do NOT include the next question's label or opening token inside the previous answer's range.
   - Include crossings-out and corrections the student made — they belong to the same answer.
   - Omit questions the student didn't answer. Omit MCQ questions unless the student wrote a handwritten answer beside them (MCQ letter selections are handled elsewhere).

2. WRITE answer_text per question:
   - For every question you produced a span for, also return \`answer_text\` — the student's clean, complete answer as written.
   - PRESERVE punctuation and mathematical symbols the student actually wrote: \`-\`, \`=\`, \`+\`, \`.\`, \`,\`, \`%\`, \`£\`, \`$\`, brackets, arrows, etc. The OCR token list routinely drops these because Cloud Vision's word-level output skips tight/small standalone marks — read them from the image and transcript, not from the tokens.
   - Concatenate multi-page answers in reading order. Separate paragraphs with a single newline (\`\\n\`).
   - Keep the student's own spelling and grammar — do NOT silently correct genuine student errors.
   - Do NOT include printed exam text (question labels like "9.", question stems, "END OF QUESTIONS", page footers). Only what the student wrote.

3. CORRECT OCR misreads (optional):
   - Compare each token's text against the transcript for that page.
   - If Cloud Vision clearly misread a word (e.g. Vision "Suly", transcript "Sales"), return a correction.
   - Do NOT correct genuine student spelling errors — only Vision OCR failures.
   - Skip tokens Vision read correctly.

Return your answer as structured JSON matching the provided schema.`
}

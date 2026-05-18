import { z } from "zod/v4"

/**
 * MCQ-question shape needed to build a schema branch for that question.
 * `option_labels` are the actual labels printed on the question (typically
 * `["A","B","C","D"]`); the schema uses `z.enum(option_labels)` so the model
 * physically cannot return an invalid letter.
 */
export type McqSchemaQuestion = {
	question_id: string
	option_labels: string[]
}

/**
 * Builds a Zod schema for the `mcq_answers` field of the attribution output.
 *
 * Per-job dynamic schema — each MCQ branch literal-matches its `question_id`
 * and enum-matches against the labels that actually exist on that question.
 * That way the model is mechanically prevented from emitting:
 *   - the option's printed text instead of the letter,
 *   - a letter not on the question (e.g. "F" on an A–D question),
 *   - an answer for a question that isn't an MCQ.
 */
function buildMcqAnswersSchema(mcqQuestions: McqSchemaQuestion[]) {
	if (mcqQuestions.length === 0) {
		// No MCQs on this script. Schema is permissive (element shape only,
		// no array-length constraint) because Anthropic's structured-output
		// validator rejects both `not` and `maxItems`. Runtime code in
		// `attribute-script.ts` filters MCQ entries against `mcqQuestionIds`,
		// so any spurious entries the model emits would be discarded anyway —
		// the prompt instructs the model to return [].
		return z.array(
			z.object({
				question_id: z.string(),
				selected_label: z.string(),
			}),
		)
	}

	const branches = mcqQuestions.map((q) =>
		z.object({
			question_id: z.literal(q.question_id),
			selected_label: z.enum(q.option_labels as [string, ...string[]]),
		}),
	)

	if (branches.length === 1) {
		return z.array(branches[0] as (typeof branches)[number])
	}

	// Zod's `discriminatedUnion` types require a tuple; the array we have is
	// equivalent at runtime but TypeScript can't narrow it.
	type Branch = (typeof branches)[number]
	return z.array(
		z.discriminatedUnion(
			"question_id",
			branches as unknown as readonly [Branch, Branch, ...Branch[]],
		),
	)
}

/**
 * Builds the full output schema for the script-level attribution LLM call.
 *
 * Attribution (`answer_spans`) is expressed as token-INDEX RANGES per page,
 * not bboxes. Ranges are `[token_start, token_end)` — half-open — over the
 * page's reading-order token list (0-based, reset at each page boundary).
 * Ranges on the same page must be pairwise disjoint across questions; this
 * is enforced by post-parse validation (overlap → reject + retry).
 *
 * The LLM also authors `answer_text` per question — a clean, marker-facing
 * transcription that fixes OCR misreads, preserves student spelling errors,
 * adds natural punctuation and paragraph breaks. Token char positions are
 * recovered downstream by fuzzy-matching OCR tokens against this text
 * (Levenshtein in `alignTokensToAnswer`); annotation positioning is
 * approximate but the marker reads polished prose.
 *
 * Sparse `corrections` patch Cloud Vision OCR misreads on individual
 * tokens, so `text_corrected` on the token row reflects what the student
 * actually wrote (used by the scan overlay when rendering raw OCR text).
 *
 * MCQ answers (`mcq_answers`) are constrained per-question by enum: each
 * MCQ branch literal-matches its `question_id` and enum-matches against
 * the option labels that actually exist on that question.
 */
export function buildScriptAttributionSchema(
	mcqQuestions: McqSchemaQuestion[],
) {
	return z.object({
		answer_spans: z
			.array(
				z.object({
					question_id: z
						.string()
						.describe(
							"The question_id exactly as provided in the question list",
						),
					answer_text: z
						.string()
						.describe(
							"The student's complete answer, marker-facing, concatenated across all pages it spans. Read directly from the image — clean punctuation, sensible paragraph breaks (use '\\n' for paragraph breaks), and correct Cloud Vision misreads against what you actually see. PRESERVE genuine student spelling errors (e.g. 'excitment', 'aswell', 'definately') — AO6 grades spelling and the marker must see them. Do NOT include printed exam text (question labels, stems, headers, footers, page numbers). Render mathematical symbols and punctuation accurately ('-', '=', '+', '%', '£', etc.).",
						),
					pages: z
						.array(
							z.object({
								page: z
									.number()
									.describe(
										"Page number — must be one of the page numbers explicitly listed in the prompt (1-based). Never 0.",
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
				}),
			)
			.describe(
				"For every question the student ANSWERED (handwritten OR typed inline), the token ranges that contain the student's answer plus the clean marker-facing answer_text. Omit questions with no answer anywhere in the script. Omit pages where this question is not answered.",
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
							"The correct word as written or typed by the student, read from the image. Verify against the page transcript before correcting.",
						),
				}),
			)
			.describe(
				"Tokens where Cloud Vision misread the text. Compare each Vision token against the transcript and against what you see on the page; include a correction only where Vision clearly got a word wrong. Do NOT correct genuine student spelling mistakes — only Vision OCR failures. Return an empty array if there are no corrections.",
			),
		mcq_answers: buildMcqAnswersSchema(mcqQuestions).describe(
			"For each MCQ question the student answered, the option letter they picked. Read the student's selection however they indicated it: tick or cross in a checkbox, circled letter, circled option text, filled-in box, or a handwritten or typed letter on blank space. Omit MCQ questions the student did not answer (no entry — do not return an entry with a fabricated label). Empty array if the script has no MCQs or none were answered.",
		),
	})
}

export type ScriptAttributionOutput = z.infer<
	ReturnType<typeof buildScriptAttributionSchema>
>

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

	const validPagesList = pageBlocks
		.map((b) => b.order)
		.sort((a, b) => a - b)
		.join(", ")

	const header = retryFeedback
		? `Your previous response was rejected for the following reason(s):
${retryFeedback}

Valid page numbers on this script: ${validPagesList}. Do not return any other page number.

Return a corrected response that fixes the problem. Keep everything else the same.

`
		: ""

	return `${header}You are examining a student's complete exam script. It has ${pageBlocks.length} page(s), provided below both as images (attached in order) and as per-page OCR token lists.

Student answers may be HANDWRITTEN or TYPED inline on the page (e.g. typed directly onto the question paper for homework, mock submissions, or accessibility). Distinguish the student's answer from the printed exam content by CONTENT and POSITION, not by whether the text is handwritten or typed:
  - Printed exam content: question stems, numbering, instructions, headers, footers, "END OF QUESTIONS", "X | Page". These are identical across every script.
  - Student answer: everything written or typed by the student in response to a question — under or alongside the question, on continuation pages, in answer boxes/lines, or directly below the printed prompt.

You must attribute the student's answers to the exam's questions — reasoning about the WHOLE script at once, not page by page. Many answers span multiple pages; mid-sentence continuation pages often have NO visible question label and must be inferred from the semantic flow of the student's argument.

The pages of this script are numbered: ${validPagesList}. Every \`page\` field you return MUST be one of these numbers — never 0, never higher than ${pageBlocks.length}, never a page that isn't in this list.

${pageSections}

The exam contains these questions:
${questionsText}

Do FOUR things:

1. ASSIGN tokens to questions (holistic, whole-script reasoning):
   - For each question the student answered, return one entry per page the answer appears on, with \`[token_start, token_end)\` — a half-open range over that page's token list.
   - A single answer that spans pages (continuation) must have one range on EACH page it covers — including pure continuation pages with no visible question label.
   - The student's answer may be HANDWRITTEN or TYPED inline on the page. Treat both the same way — the modality doesn't change what counts as an answer.
   - Reason from CONTENT, not just labels:
     • Use printed question numbers when visible.
     • When a page has no visible label, infer which open answer it continues from the semantic flow, argument structure, and layout of the student's writing/typing.
     • Printed exam text (question stems, instructions, page headers/footers, "END OF QUESTIONS", "X | Page") is NOT part of any answer — leave those tokens outside every range. This holds even when the student's answer is also typed: the question stems are identical to every other copy of the exam paper, while the student's answer is unique to this script.
     • Cover pages, blank pages, and template-only pages contain NO ranges at all.
   - Ranges on the SAME page must be pairwise DISJOINT. For any two ranges on the same page, \`token_end\` of the earlier range must be less than or equal to \`token_start\` of the later range. A single token index may appear in at most ONE range. Examples:
     • Valid (adjacent, no overlap):   Q1 [0,10), Q2 [10,25), Q3 [25,40)
     • INVALID (overlap by 1 at 10):   Q1 [0,11), Q2 [10,25)
     • INVALID (one range inside another): Q1 [0,100), Q2 [50,80)
   - When two answers sit next to each other on a page, pick the exact index where the previous answer ends and the next begins — do NOT include the next question's label or opening token inside the previous answer's range.
   - Include crossings-out and corrections the student made — they belong to the same answer.
   - Omit questions the student didn't answer. Omit MCQ questions from \`answer_spans\` — MCQ selections are returned in \`mcq_answers\` (step 4 below).

2. WRITE \`answer_text\` per question (marker-facing, ONE per question, concatenated across pages):
   - This is what the marker reads. Read directly from the image and transcribe what the student actually wrote.
   - Fix Cloud Vision OCR misreads silently — write the correct word as the student wrote it. The OCR token list is a hint, not the source of truth; the image is.
   - PRESERVE the student's spelling exactly, including genuine misspellings:
     • Student wrote "excitment" → write "excitment" (do not fix to "excitement"). AO6 grades spelling.
     • Student wrote "aswell" / "definately" / "alot" → keep verbatim.
     • Tie-breaker: when in doubt about whether a misspelling is OCR or student, PRESERVE IT. Under-correction is safer than over-correction.
   - Add punctuation and capitalisation as the student wrote them. Use sensible paragraph breaks ('\\n') where the student left a visible blank line on the page.
   - PRESERVE mathematical symbols and punctuation: '-', '=', '+', '.', ',', '%', '£', '$', brackets, arrows. Read these from the image — Cloud Vision's word tokens routinely drop standalone marks.
   - Concatenate multi-page answers in reading order. Separate paragraphs with a single '\\n'.
   - Do NOT include printed exam text (question labels like "9.", question stems, "END OF QUESTIONS", page footers like "4 | Page"). Only what the student wrote or typed.
   - Do NOT include the student's name written on a cover page or in a name field — that's not part of any answer.

3. PATCH Cloud Vision OCR misreads (\`corrections\`):
   - For each token where Vision clearly misread the word, return \`{ page, token_index, corrected }\`. This populates \`text_corrected\` on the token row so the scan overlay can show what the student actually wrote at that token's bbox.
   - Identify Vision misreads by comparing the OCR token against the page transcript AND the image. If transcript and image agree on word X but the OCR token reads Y, correct to X.
   - DO NOT correct genuine STUDENT spelling errors — same rules as step 2 above.
   - Return an empty \`corrections\` array if Vision got everything right. Most tokens are correct; corrections are sparse.
   - Do NOT emit corrections for tokens outside any \`answer_spans\` range — patching printed exam text or page headers wastes output budget.

4. EXTRACT MCQ selections (\`mcq_answers\`):
   - For every question marked [multiple-choice] in the question list, identify the single option letter the student selected by inspecting the page image.
   - Students indicate their choice in many ways: a tick or cross in a checkbox next to a letter, circling a letter, circling option text, filling in a box, writing the letter on blank space, or typing the letter inline next to the question.
   - Return ONLY the letter as \`selected_label\`. The schema enforces that the letter must be one of the option labels actually listed for that question (A, B, C, D, etc.) — do not invent letters. NEVER return the option's printed text.
   - If a student crossed out one selection and ticked another, return the final selection.
   - Omit MCQs the student didn't answer (no entry in \`mcq_answers\`).

Return your answer as structured JSON matching the provided schema.`
}

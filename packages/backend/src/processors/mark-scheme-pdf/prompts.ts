export type ExistingQuestionContext = {
	id: string
	question_number: string | null
	text: string
	question_type: string
}

/**
 * Builds the "EXISTING QUESTIONS" block injected at the end of the extraction
 * prompt to give Gemini context for populating `matched_question_id`.
 */
export function buildExistingQuestionsBlock(
	questions: ExistingQuestionContext[],
): string {
	if (questions.length === 0) return ""
	return `\n\nEXISTING QUESTIONS (for matched_question_id lookup ONLY):\n${questions
		.map(
			(eq) =>
				`- id: "${eq.id}" | question_number: "${eq.question_number ?? "?"}" | text: "${eq.text.slice(0, 300)}"`,
		)
		.join(
			"\n",
		)}\n\nMATCHING INSTRUCTIONS — READ CAREFULLY:\n- For EACH extracted mark scheme entry, check whether it corresponds to one of the EXISTING QUESTIONS above (match primarily by question_number, and secondarily by content). If a match is found, set matched_question_id to that question's id. If no match is found, set matched_question_id to null.\n- CRITICAL: The existing questions list is ONLY used to populate matched_question_id. You MUST extract ALL other fields (question_text, question_type, correct_option, mark_points, marking_method, etc.) EXCLUSIVELY from the mark scheme PDF document. Do NOT use the existing questions list to influence any other field. An MCQ entry that shows only "1 C" in the PDF must still be extracted as question_type "multiple_choice" with correct_option "C" — even if the matched existing question has a long written text.`
}

/**
 * Builds the full extraction user prompt for the Gemini mark scheme call.
 */
export function buildExtractionPrompt(existingQuestionsBlock: string): string {
	return `Extract all questions and their mark scheme details from this document.

IMPORTANT — Multiple Choice Questions (MCQ):
Mark schemes for MCQ sections often show a table or list like "1 C  2 A  3 D ...". You MUST extract EACH numbered MCQ as a SEPARATE question entry — do NOT create a single entry for the whole MCQ section. For each MCQ entry:
- question_text: the actual question text if visible; if only a question number and correct option are shown (no question text in the mark scheme), set question_text to "Question [number]" as a placeholder
- question_type: "multiple_choice"
- question_number: the question number as a string (e.g. "1", "2", "15")
- correct_option: the correct option label (e.g. "C", "A", "D")
- total_marks: 1 (unless stated otherwise)
- marking_method: "multiple_choice"
- options: include the A/B/C/D options if the question text is visible in this document; omit if only the answer is shown

GENERAL RULES:
- Clean up all extracted text: ensure proper spacing between words, correct punctuation, and proper line breaks. Fix any OCR artefacts such as run-together words or missing spaces.
- For each written question provide: question_text, question_type ("written"), total_marks, ao_allocations if present, mark_points (array of { criteria }), acceptable_answers if listed, guidance, question_number.
- Detect marking_method: "multiple_choice" for MCQ, "level_of_response" if the mark scheme uses level descriptors with mark ranges (e.g. Level 1: 1–3 marks), or "point_based" for individual mark point criteria.
- If level_of_response: extract command_word if given, items_required if given, levels (array of { level, mark_range [min, max], descriptor, ao_requirements? }), and caps if any (array of { condition, max_level or max_mark, reason }).

MARK POINTS — RULES:
- total_marks MUST match the mark allocation stated in the document (e.g. "(2 marks)").
- Every mark_point is worth exactly 1 mark. mark_points.length MUST equal total_marks. A 2-mark question = 2 mark_points; a 3-mark question = 3 mark_points. Never emit a single mark_point that "carries" multiple marks — always split.
- \`criteria\` describes ONE creditable element of student content. Keep it short and document-faithful — ideally 5–15 words, the actual thing the student must say. No prefixes like "Award 1 mark for…" (every mark_point is 1 mark by definition). No hedges, no inline examples, no "accept loose wording" — that lives in guidance.
- Never compound elements with "BOTH X AND Y" inside one criterion. Two creditable things = two mark_points.
- Never emit vague placeholders ("Identification of a correct way", "Correct answer"). Copy creditable content from the document.

PATTERNS — splitting by question shape:
- **2-mark define/explain ("what is meant by…")**: identify the two creditable elements in the mark scheme — emit one terse mark_point per element. Student showing one element scores 1/2; both → 2/2.
- **"1 mark for each correct [item] up to N marks"**: emit N mark_points, each with the same verbatim list of acceptable answers from the document.
- **"1 mark identify + 1 mark develop/explain"**: 2 mark_points — first is the list of valid identifications; second is the linked explanation/consequence.
- **Calculation**: one mark_point per marking step in the worked solution, each naming the step concisely.

GUIDANCE — faithful to the document, no editorialising:
- Guidance carries ONLY what the PDF mark scheme actually says: "Accept…", "Do not accept…", "Credit if…", "Answers may include…" — copied verbatim. If the document has no rubric notes, leave guidance empty or set it to just the "Answers may include" list.
- Do NOT add templated leniency phrases ("accept loose wording", "the student does not need textbook vocabulary", etc.). Marking philosophy lives in the grader, not in extracted guidance — the grader applies teacher judgement. Guidance must be document-faithful.
- Do not embed mark ladders, worked examples, or per-element marking instructions. Criteria carry the creditable content; the grader decides whether the student earned each mark.

WORKED EXAMPLE — 2-mark define/explain ("What is meant by 'franchising'? (2 marks)")
Mark scheme content: "Right/licence to use the franchisor's brand and business model in return for a fee/royalty/share of profits. Often includes ongoing support."

Correct extraction shape:
{
  "total_marks": 2,
  "marking_method": "point_based",
  "mark_points": [
    { "criteria": "Right/licence to use the franchisor's brand, name, products, or business model." },
    { "criteria": "Fee, royalty, or share of profits paid to the franchisor — and/or ongoing support received." }
  ],
  "guidance": "Answers may include: rights/licence to use brand; payment of fee/royalty/share of profits; ongoing support (training, marketing, supplies)."
}

CONTENT FIELD — LEVEL OF RESPONSE QUESTIONS:
- For every level_of_response question, populate the \`content\` field with the COMPLETE mark scheme as clean markdown.
- The markdown MUST include ALL of the following sections that appear in the document for this question:
  * **## Level descriptors** — each level with its mark range, descriptor text, and AO requirements (e.g. "### Level 3 (7–9 marks)")
  * **## Indicative content** — the "Answers may include" or "Indicative content" section, copied verbatim with all bullet points
  * **## Exemplar answer** — any "Example of a Level N developed answer" text, labelled with the level it represents
  * **## Marker notes** — any "Do not accept…", "Accept…", "Credit if…" instructions
  * **## Caps** — any capping rules (e.g. "If no evaluation, cap at Level 2")
  * Command word and items_required if stated (include at the top under a "## Question" heading)
- Use ## headings for each section. Copy content verbatim from the document — do not summarise.
- For point_based and multiple_choice questions, set \`content\` to null — it is not needed.

AO BREAKDOWN — CRITICAL RULES:
- AQA mark schemes print a "Marks for this question:" header above the level table, e.g. "AO2 – 3 marks    AO3 – 6 marks". Extract ONLY the AO codes and mark values stated in that line as ao_allocations.
- For level_of_response questions, the right-hand column of each level's bullet points is labelled with an AO code (e.g. AO3, AO2). Copy these labels verbatim into ao_requirements for each level — include ONLY the codes that appear in the document for that level.
- NEVER invent or infer AO codes that are not explicitly printed in the mark scheme. AQA GCSE Business papers typically use only AO2 and AO3; do not add AO1 or AO4 unless they are literally present in the document.${existingQuestionsBlock}`
}

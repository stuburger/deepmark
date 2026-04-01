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
- For each written question provide: question_text, question_type ("written"), total_marks, ao_allocations if present, mark_points (array of { description, criteria, points }), acceptable_answers if listed, guidance, question_number.
- Detect marking_method: "multiple_choice" for MCQ, "level_of_response" if the mark scheme uses level descriptors with mark ranges (e.g. Level 1: 1–3 marks), or "point_based" for individual mark point criteria.
- If level_of_response: extract command_word if given, items_required if given, levels (array of { level, mark_range [min, max], descriptor, ao_requirements? }), and caps if any (array of { condition, max_level or max_mark, reason }).

MARK POINTS, GUIDANCE AND TOTAL MARKS — CRITICAL RULES:
- total_marks MUST match the mark allocation explicitly stated in the document (e.g. "(2 marks)" in the question or the sum of AO marks in the header). Never default to 1 when the document says otherwise.
- guidance MUST be populated whenever the mark scheme provides a list of acceptable answers or example responses. Copy the FULL "Answers may include" / "Possible answers" list verbatim into guidance, including any worked examples or developed answer examples.
- mark_points MUST be genuinely descriptive — never use vague placeholders like "Identification of a correct way" or "Correct answer". The criteria field must contain the actual acceptable content from the mark scheme:
  * For "1 mark for each correct [item] up to N marks" patterns: create N mark points each worth 1 mark. Set criteria to the specific list of acceptable answers from the document (e.g. "Acceptable: Mystery shoppers / Customer service surveys / Number of repeat sales / Amount of returned products / Volume of complaints / Quality control checks / Quality assurance / TQM").
  * For "1 mark identify + 1 mark develop/explain" patterns: create 2 separate mark points. First point: description="Identify [the concept]", criteria=the full list of valid identifications from the document. Second point: description="Development / explanation", criteria="Award 1 mark for a linked explanation or consequence that develops the identified point (e.g. 'which means the exact requirements of customers can be met')".
  * For calculation questions: description="Correct calculation method", criteria="Show the exact working required (e.g. step-by-step calculation shown in the mark scheme)".
  * Always copy the specific example answers, bullet-point lists, and any worked examples from the document into the criteria or guidance fields — never summarise or omit them.

AO BREAKDOWN — CRITICAL RULES:
- AQA mark schemes print a "Marks for this question:" header above the level table, e.g. "AO2 – 3 marks    AO3 – 6 marks". Extract ONLY the AO codes and mark values stated in that line as ao_allocations.
- For level_of_response questions, the right-hand column of each level's bullet points is labelled with an AO code (e.g. AO3, AO2). Copy these labels verbatim into ao_requirements for each level — include ONLY the codes that appear in the document for that level.
- NEVER invent or infer AO codes that are not explicitly printed in the mark scheme. AQA GCSE Business papers typically use only AO2 and AO3; do not add AO1 or AO4 unless they are literally present in the document.${existingQuestionsBlock}`
}

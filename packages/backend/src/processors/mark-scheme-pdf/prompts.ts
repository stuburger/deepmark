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

MARK POINTS, GUIDANCE AND TOTAL MARKS — CRITICAL RULES:
- total_marks MUST match the mark allocation explicitly stated in the document (e.g. "(2 marks)" in the question or the sum of AO marks in the header). Never default to 1 when the document says otherwise.
- EVERY mark_point in the array is worth exactly 1 mark. The schema does not let you assign 2 marks to a single mark_point — there is no \`points\` field. The number of mark_points in the array MUST equal total_marks. A 2-mark question yields two mark_points; a 3-mark question yields three; and so on. NEVER emit a single mark_point intended to carry multiple marks — always split it.
- guidance MUST be populated whenever the mark scheme provides a list of acceptable answers, example responses, "Answers may include" content, or any rubric notes about how examiners should apply the mark scheme. Copy the FULL list verbatim into guidance, including worked or developed answer examples. The downstream grader reads guidance and uses it to apply judgement when student wording is loose or incomplete.
- \`criteria\` is the ONLY field the grader reads to decide whether a student earned a specific mark — it must be specific and concrete, never a vague placeholder like "Identification of a correct way" or "Correct answer". Copy directly from the document where possible.

PATTERNS — how to split mark_points by question shape:
  * **2-mark "define / explain / what is meant by" questions** (definition/explain pattern). Even if the mark scheme prints one block of acceptable content worth 2 marks, you MUST split into two distinct mark_points:
      - mark_point 1 \`criteria\`: "Award 1 mark for any recognisable understanding of the concept — one valid feature, example, purpose, or mechanism, even if wording is loose, technical vocabulary is missing, or only one of the key elements is present. Acceptable indicators include: [copy the acceptable-answer list / 'Answers may include' bullets verbatim from the document]."
      - mark_point 2 \`criteria\`: "Award 1 mark for a complete and precise definition that includes BOTH key elements: [list the specific elements verbatim from the mark scheme — e.g. for 'franchising': (a) the franchisor grants rights/licence to use the brand AND (b) the franchisee pays a fee or share of profits / receives ongoing support]."
  * **"1 mark for each correct [item] up to N marks"** — create N mark_points. Each mark_point's \`criteria\` is the same verbatim list of acceptable answers from the document. The grader will award one mark per distinct acceptable answer the student provides.
  * **"1 mark identify + 1 mark develop/explain"** — create 2 separate mark_points. First's \`criteria\`: full list of valid identifications. Second's \`criteria\`: "Award 1 mark for a linked explanation or consequence that develops the identified point (e.g. 'which means the exact requirements of customers can be met')".
  * **Calculation questions** — one mark_point per marking step in the worked solution. Each \`criteria\` describes the specific step (e.g. "Award 1 mark for correctly calculating gross profit: Revenue − COGS = £X").

GUIDANCE FIELD — partial credit & examiner judgement:
- For 2-mark definition / explain questions, the guidance field MUST include all of the following, in addition to verbatim "Answers may include" content from the document:
    1. A 0/1/2 mark ladder spelled out:
       - 2 marks = clear, accurate definition with both key elements present.
       - 1 mark = some valid understanding, even if incomplete, vague, missing technical vocabulary, or missing one key element. A relevant example that demonstrates the student "gets it" can earn this mark.
       - 0 marks = incorrect, irrelevant, or no meaningful understanding.
    2. The instruction: "Do NOT award 0 simply because the answer is incomplete. Award 1 mark whenever the student demonstrates recognisable understanding of the concept (one valid feature, example, purpose, or mechanism). 0 should be reserved for answers that are wrong, irrelevant, or show no creditworthy understanding."
    3. The instruction: "An example that demonstrates understanding can be credited even if the textbook definition is not given verbatim. Apply examiner judgement — does the student 'get it'?"
- For all other point_based questions, guidance should still capture any "Accept…", "Do not accept…", "Credit if…" notes from the document so the grader can apply them.

WORKED EXAMPLE — define/explain split for a 2-mark question:
Question (from PDF): "What is meant by the term 'franchising'? (2 marks)"
Mark scheme content (in PDF): "A business arrangement where the franchisor grants the franchisee the right/licence to use its brand, products and business model in return for a fee and/or share of profits. Often includes ongoing support."

Correct extraction:
{
  "question_text": "What is meant by the term 'franchising'?",
  "question_type": "written",
  "total_marks": 2,
  "marking_method": "point_based",
  "mark_points": [
    { "criteria": "Award 1 mark for any recognisable understanding of franchising — that one business is granting another the right/licence to operate under their brand, OR that the franchisee uses the franchisor's name/products/business model. Loose wording is acceptable; a concrete example (e.g. McDonald's, Subway) that shows the student understands the concept also earns this mark." },
    { "criteria": "Award 1 mark for a complete definition that includes BOTH (a) the franchisor grants rights/licence to use the brand/business model AND (b) the franchisee pays a fee, royalty, or share of profits in return (and/or receives ongoing support such as training, marketing)." }
  ],
  "guidance": "Answers may include: rights/licence to use brand; use of products and business model; payment of upfront fee / royalties / share of profits; ongoing support such as training, marketing, supplies. Example accepted: 'A larger firm gives a company rights and licences to open a store using their business' — award 1 mark for recognisable understanding (rights/brand identified, but no payment/support element). Example accepted: 'You let someone have the rights to your brand and they open a business and you receive a percentage of profits' — award 2 marks (both elements present). 0/1/2 mark ladder: 2 = both key elements (rights AND payment/support); 1 = one element OR a relevant example that demonstrates understanding even if technical vocabulary is missing; 0 = wrong, irrelevant, or no meaningful understanding. Do NOT award 0 simply because the answer is incomplete — only when there is no creditworthy understanding. An example that demonstrates the student 'gets it' can be credited even if the textbook definition is not given verbatim."
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

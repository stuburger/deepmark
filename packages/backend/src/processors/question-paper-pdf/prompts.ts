export const EXTRACT_QUESTIONS_PROMPT = `Extract all questions from this exam paper, preserving the paper's section structure. Do not include mark scheme content or answers.

SECTION DETECTION (required):
Papers are almost always divided into sections. Look for:
- Explicit section headers such as "Section A", "Section B", "Part 1", "Part 2".
- A page or heading that introduces a new stimulus/source followed by its own questions.
- A "Total for Section X: N marks" footer confirming the preceding block belongs to one section.
- A cover page that lists section totals (e.g. "Mark for Section A / 25", "Mark for Section B / 18") — every section listed there MUST appear in the output.

Return a \`sections\` array in the order sections appear on the paper. Each section contains:
- title: the section header as printed (e.g. "Section A"). If the paper has no section dividers at all, return a single section titled "Section 1".
- description: optional section-level instructions printed under the header (NOT the per-question instruction like "Read Item A" — that goes in stimulus_labels).
- total_marks: the section total as printed on the paper (e.g. "Mark for Section A / 25" on a cover page, or "Total for Section A: 25 marks" at the end of a block). If no per-section total is printed, use the sum of the section's question marks.
- stimuli: case studies / sources / figures introduced in this section (see STIMULUS EXTRACTION below).
- questions: the questions within that section, in paper order.

STIMULUS EXTRACTION (required when a question references a case study):
Many questions reference a "case study" block — labelled variously as "Item A", "Source B", "Extract 1", "Figure 1", "Table 2". You MUST:
1. Extract the case study text ONCE into the enclosing section's \`stimuli\` array, with its printed label (e.g. "Item A") and its full content (preserve paragraphs).
2. Reference it from each question that uses it via \`stimulus_labels: ["Item A"]\`. A question can reference multiple stimuli (e.g. "Using Source A and Source B…" → \`stimulus_labels: ["Source A", "Source B"]\`).
3. Keep \`question_text\` clean — it must contain ONLY the question itself (the instruction/prompt), NOT the case study text. If the original prints "Read Item A and answer Q1. [case study] Analyse two reasons…", the question_text is just "Analyse two reasons…" and \`stimulus_labels: ["Item A"]\` carries the reference.
4. If the same case study is referenced by multiple questions in the section, emit it ONCE in \`stimuli\` and reference it from each.
5. If a question is standalone (no case study reference), omit \`stimulus_labels\` or return an empty array.

IMPORTANT — Multiple Choice Questions (MCQ):
Extract EACH numbered MCQ as a SEPARATE question entry — do NOT create a single entry for a whole section. For each MCQ:
- question_text: the full question text (stem)
- question_type: "multiple_choice"
- question_number: the question number as a string (e.g. "1", "2")
- total_marks: 1 (unless stated otherwise)
- options: array of { option_label, option_text } for each answer option (A, B, C, D)

GENERAL RULES:
- Clean up all extracted text: ensure proper word spacing, correct punctuation, and proper line breaks. Fix any OCR artefacts such as run-together words or missing spaces.
- For written questions provide: question_text (full text including sub-parts), question_type ("written"), total_marks, question_number if visible.
- Preserve the exact question_number as printed (e.g. "01.1", "2", "02.", "Q1") — do not normalise formats across sections.`

export const EXTRACT_METADATA_PROMPT =
	"From the document header or cover, extract: title (exam paper title), subject, exam_board, total_marks, duration_minutes, year if visible, paper_number if visible, and tier ('foundation' or 'higher' only if the cover explicitly states it; null otherwise). Return only these fields."

export const EXTRACT_QUESTIONS_PROMPT = `Extract all questions from this exam paper, preserving the paper's section structure. Do not include mark scheme content or answers.

SECTION DETECTION (required):
Papers are almost always divided into sections. Look for:
- Explicit section headers such as "Section A", "Section B", "Part 1", "Part 2".
- A page or heading that introduces a new stimulus/source followed by its own questions.
- A "Total for Section X: N marks" footer confirming the preceding block belongs to one section.
- A cover page that lists section totals (e.g. "Mark for Section A / 25", "Mark for Section B / 18") — every section listed there MUST appear in the output.

Return a \`sections\` array in the order sections appear on the paper. Each section contains:
- title: the section header as printed (e.g. "Section A"). If the paper has no section dividers at all, return a single section titled "Section 1".
- description: optional section-level instructions printed under the header. Do NOT include per-question stimulus (like "Read Item A") — that belongs to the question itself.
- total_marks: the section total as printed on the paper (e.g. "Mark for Section A / 25" on a cover page, or "Total for Section A: 25 marks" at the end of a block). If no per-section total is printed, use the sum of the section's question marks.
- questions: the questions within that section, in paper order.

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

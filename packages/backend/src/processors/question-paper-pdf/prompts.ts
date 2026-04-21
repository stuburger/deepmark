export const EXTRACT_QUESTIONS_PROMPT = `Extract all questions from this exam paper. Do not include mark scheme content or answers.

IMPORTANT — Multiple Choice Questions (MCQ):
Extract EACH numbered MCQ as a SEPARATE question entry — do NOT create a single entry for a whole section. For each MCQ:
- question_text: the full question text (stem)
- question_type: "multiple_choice"
- question_number: the question number as a string (e.g. "1", "2")
- total_marks: 1 (unless stated otherwise)
- options: array of { option_label, option_text } for each answer option (A, B, C, D)

GENERAL RULES:
- Clean up all extracted text: ensure proper word spacing, correct punctuation, and proper line breaks. Fix any OCR artefacts such as run-together words or missing spaces.
- For written questions provide: question_text (full text including sub-parts), question_type ("written"), total_marks, question_number if visible.`

export const EXTRACT_METADATA_PROMPT =
	"From the document header or cover, extract: title (exam paper title), subject, exam_board, total_marks, duration_minutes, year if visible, paper_number if visible, and tier ('foundation' or 'higher' only if the cover explicitly states it; null otherwise). Return only these fields."

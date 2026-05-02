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
- printed_total_marks: the section total EXACTLY as printed (e.g. 25), or null if no section total is printed. NEVER sum the questions yourself — this field is ONLY the literal printed value. It is used downstream to verify the per-question marks add up correctly.
- stimuli: case studies / sources / figures introduced in this section (see STIMULUS EXTRACTION below).
- questions: the questions within that section, in paper order.

PRINTED MARKS (verification field — required on every question):
For each question you MUST set \`printed_marks\` to:
- The integer printed in parentheses next to that specific question (e.g. 2 from "(2 marks)", 12 from "(12 marks)"), OR
- null if no parenthetical mark count is printed adjacent to that question.

CRITICAL: \`printed_marks\` is a literal-copy field for verification. NEVER infer it from context, the marks of nearby questions, the section total, or the question's apparent difficulty. If the parenthetical isn't there next to the specific question, it is null. \`total_marks\` and \`printed_marks\` will both be checked downstream — if you copy the wrong number, the discrepancy will be flagged for human review, so accuracy here matters more than coverage.

STIMULUS EXTRACTION (required when a question references a case study):
Many questions reference a "case study" block — labelled variously as "Item A", "Source B", "Extract 1", "Figure 1", "Table 2". You MUST:
1. Extract the case study ONCE into the enclosing section's \`stimuli\` array, with its printed label (e.g. "Item A").
2. Set \`content_type\`:
   - "table" if the stimulus is tabular data (rows × columns). Emit \`content\` as a GitHub-flavoured markdown pipe-table — header row, separator row of dashes, then data rows. Do NOT wrap in a code fence. Preserve the exact column headers and cell values as printed.
   - "text" for everything else — case studies, prose sources, extracts. Preserve paragraphs.
   - Do NOT emit "image" — figures and diagrams that can't be transcribed should still use "text" with a description ("Figure 1 shows a cross-section of a leaf with organelles labelled A–D…").
3. Reference the stimulus from each question that uses it via \`stimulus_labels: ["Item A"]\`. A question can reference multiple stimuli (e.g. "Using Source A and Source B…" → \`stimulus_labels: ["Source A", "Source B"]\`).
4. Keep \`question_text\` clean — it must contain ONLY the question itself (the instruction/prompt), NOT the stimulus content. If the original prints "Read Item A and answer Q1. [case study] Analyse two reasons…", the question_text is just "Analyse two reasons…" and \`stimulus_labels: ["Item A"]\` carries the reference.
5. If the same stimulus is referenced by multiple questions in the section, emit it ONCE in \`stimuli\` and reference it from each.
6. If a question is standalone (no stimulus reference), omit \`stimulus_labels\` or return an empty array.

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

export const EXTRACT_METADATA_PROMPT = `From the document header or cover, extract: title (exam paper title), subject, exam_board, total_marks, printed_total_marks, duration_minutes, year if visible, paper_number if visible, and tier ('foundation' or 'higher' only if the cover explicitly states it; null otherwise).

\`printed_total_marks\` is the paper-wide total EXACTLY as printed on the cover or front matter — e.g. 43 from "The maximum mark for this paper is 43" or "Total Mark / 43". Null if no paper-wide total is explicitly printed. NEVER sum sections yourself — this field is ONLY the literal printed value, used downstream to verify the section subtotals add up.

Return only these fields.`

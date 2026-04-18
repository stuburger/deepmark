/**
 * The shape written into `ocr_runs.extracted_answers_raw.answers[]` and
 * consumed by the grading processor. Produced by `attributeScript` — the
 * holistic LLM call returns `answer_text` per question directly.
 */
export type ReconstructedAnswer = {
	question_id: string
	answer_text: string
}

/**
 * Attributed token row — fields needed for answer reconstruction.
 * Tokens must be provided in reading order (page_order → para_index →
 * line_index → word_index) by the caller.
 */
export type AttributedToken = {
	id: string
	question_id: string
	page_order: number
	para_index: number
	line_index: number
	word_index: number
	text_raw: string
	text_corrected: string | null
}

/**
 * Reconstructs per-question answer text by joining attributed token text in
 * reading order. Prefers `text_corrected` over `text_raw` — `text_corrected`
 * is set by the fixOCR step where Cloud Vision and the Gemini transcript
 * disagreed (i.e. a genuine OCR error, not a student misspelling).
 *
 * Every question ID in `questionIds` appears in the output — questions with
 * no attributed tokens get an empty string.
 *
 * Tokens must already be sorted in reading order by the caller.
 */
export function reconstructAnswersFromTokens(
	tokens: AttributedToken[],
	questionIds: string[],
): Array<{ question_id: string; answer_text: string }> {
	const grouped = new Map<string, string[]>()
	for (const t of tokens) {
		const words = grouped.get(t.question_id) ?? []
		words.push(t.text_corrected ?? t.text_raw)
		grouped.set(t.question_id, words)
	}

	return questionIds.map((id) => ({
		question_id: id,
		answer_text: (grouped.get(id) ?? []).join(" "),
	}))
}

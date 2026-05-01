/**
 * Normalise an OCR-returned MCQ option label to just the letter(s).
 *
 * The model is told to return only letters (e.g. ['C']), but occasionally
 * packs in the option text — e.g. 'C - Farming'. Without this guard, the
 * deterministic MCQ marker explodes such a string into ['A','C','F','G',
 * 'I','M','N','R'] and silently zeroes the question. This is the safety net
 * behind the prompt + schema instructions.
 *
 * Returns the leading 1–3 uppercase letter run iff it's followed by a
 * non-letter or end-of-string. Returns "" for inputs we can't safely
 * interpret (no leading short letter run, or a leading run that's clearly
 * a word like "FARMING") — the caller drops empties and falls back to the
 * attribution-authored answer text.
 */
export function normalizeMcqLabel(raw: string): string {
	const upper = raw.trim().toUpperCase()
	const match = upper.match(/^[A-Z]{1,3}(?=$|[^A-Z])/)
	return match?.[0] ?? ""
}

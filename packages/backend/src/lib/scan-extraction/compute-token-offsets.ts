import type { AttributedToken } from "./reconstruct-answers"

export type TokenCharOffset = {
	id: string
	charStart: number
	charEnd: number
}

/**
 * Computes character start/end offsets for each token within its reconstructed
 * answer text. Uses `text_corrected ?? text_raw` to match the text produced by
 * `reconstructAnswersFromTokens` exactly.
 *
 * Tokens for each question must be in reading order (page_order → para_index
 * → line_index → word_index). Returns one `TokenCharOffset` per token across
 * all questions.
 */
export function computeTokenCharOffsets(
	tokensByQuestion: Map<string, AttributedToken[]>,
): TokenCharOffset[] {
	const offsets: TokenCharOffset[] = []

	for (const tokens of tokensByQuestion.values()) {
		let pos = 0
		for (const token of tokens) {
			const word = token.text_corrected ?? token.text_raw
			const len = word.length
			offsets.push({ id: token.id, charStart: pos, charEnd: pos + len })
			pos += len + 1 // +1 for space separator between tokens
		}
	}

	return offsets
}

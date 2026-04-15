// ─── Types ─────────────────────────────────────────────────────────────────

export type AlignableToken = {
	id: string
	text_raw: string
	text_corrected: string | null
}

export type QuestionTokenGroup = {
	questionId: string
	questionNumber: string
	tokens: AlignableToken[]
	answerText: string
}

export type TokenOffsetUpdate = {
	id: string
	charStart: number | null
	charEnd: number | null
	textCorrected: string | null
}

export type WordWithOffset = { word: string; start: number; end: number }

// ─── Pure helpers ──────────────────────────────────────────────────────────

export function splitWithOffsets(text: string): WordWithOffset[] {
	const words: WordWithOffset[] = []
	const regex = /\S+/g
	let match: RegExpExecArray | null = null
	for (match = regex.exec(text); match !== null; match = regex.exec(text)) {
		words.push({
			word: match[0],
			start: match.index,
			end: match.index + match[0].length,
		})
	}
	return words
}

export function formatTokenList(tokens: AlignableToken[]): string {
	return tokens
		.map((t, i) => {
			const raw = t.text_raw
			const corrected = t.text_corrected
			return corrected && corrected !== raw
				? `[${i}] raw: "${raw}" → corrected: "${corrected}"`
				: `[${i}] "${raw}"`
		})
		.join("\n")
}

export function formatAnswerWords(words: WordWithOffset[]): string {
	return words.map((w, i) => `[${i}] "${w.word}"`).join("\n")
}

/**
 * Pure: maps LLM structured output → char offset records.
 * Testable without mocks.
 */
export function mapMappingsToOffsets(
	mappings: Array<{
		token_index: number
		answer_word_index: number
		text_corrected: string
	}>,
	tokens: AlignableToken[],
	answerWords: WordWithOffset[],
): TokenOffsetUpdate[] {
	// Index mappings by token_index for O(1) lookup
	const byTokenIndex = new Map(mappings.map((m) => [m.token_index, m]))

	// Produce one update per token — unmapped tokens get null offsets
	return tokens.map((token, i) => {
		const m = byTokenIndex.get(i)
		if (!m) {
			return {
				id: token.id,
				charStart: null,
				charEnd: null,
				textCorrected: token.text_corrected,
			}
		}

		const answerWord =
			m.answer_word_index >= 0 && m.answer_word_index < answerWords.length
				? answerWords[m.answer_word_index]
				: null

		return {
			id: token.id,
			charStart: answerWord?.start ?? null,
			charEnd: answerWord?.end ?? null,
			textCorrected:
				m.text_corrected !== token.text_raw
					? m.text_corrected
					: token.text_corrected,
		}
	})
}

import { z } from "zod/v4"

/**
 * Per-token word-index mapping schema.
 *
 * The LLM receives the student's `answer_text` pre-split into indexed words,
 * and an ordered list of OCR tokens (spatial reading order). For each token
 * it returns the `word_index` the token corresponds to — or null for page
 * artifacts, stray marks, and garbled fragments that aren't part of the
 * answer. A post-processing step converts word indices back to character
 * ranges using the same word-split offsets.
 *
 * Word-index framing is deliberately chosen over raw character offsets:
 * LLMs are unreliable at character arithmetic over long text but reliable
 * at "which item in this indexed list does this refer to". Option C in the
 * bbox-alignment fix discussion.
 */
export const TokenCharMappingSchema = z.object({
	mappings: z
		.array(
			z.object({
				token_index: z
					.number()
					.describe("0-based index into the input token list."),
				word_index: z
					.number()
					.nullable()
					.describe(
						"0-based index into the answer word list. Null if the token does not correspond to any answer word (page artifact, stray mark, unusable OCR fragment).",
					),
			}),
		)
		.describe(
			"Exactly one mapping per input token, in the same order as the input tokens.",
		),
})

export type TokenCharMappingOutput = z.infer<typeof TokenCharMappingSchema>

export type MappingTokenInput = {
	text_raw: string
	text_corrected: string | null
}

/**
 * Split answer text into words that align with what the prompt shows the
 * LLM. Each word has its character range in the answer text.
 *
 * Matches the semantics of `splitWithOffsets` in
 * `apps/web/src/lib/marking/alignment/string-utils.ts` — whitespace-separated
 * runs — so callers can feed the result into the same alignment consumers.
 */
export type AnswerWord = { word: string; start: number; end: number }

export function splitAnswerWords(answerText: string): AnswerWord[] {
	const result: AnswerWord[] = []
	const regex = /\S+/g
	for (
		let match = regex.exec(answerText);
		match !== null;
		match = regex.exec(answerText)
	) {
		result.push({
			word: match[0],
			start: match.index,
			end: match.index + match[0].length,
		})
	}
	return result
}

export function buildTokenCharMappingPrompt({
	answerText,
	tokens,
}: {
	answerText: string
	tokens: MappingTokenInput[]
}): string {
	const words = splitAnswerWords(answerText)
	const wordList = words.map((w, i) => `[${i}] "${w.word}"`).join("\n")
	const tokenList = tokens
		.map((t, i) => {
			const effective = t.text_corrected ?? t.text_raw
			const gloss =
				t.text_corrected && t.text_corrected !== t.text_raw
					? ` (OCR read: "${t.text_raw}")`
					: ""
			return `[${i}] "${effective}"${gloss}`
		})
		.join("\n")

	return `You are given a student's handwritten exam answer reconstructed as clean text (split into indexed words), and the OCR word tokens extracted from the scan in spatial reading order. For each token, identify which answer word it represents.

Answer text (for reference):
"""
${answerText}
"""

Answer words (0-based, whitespace-split):
${wordList}

OCR tokens (0-based, in spatial reading order as they appear on the scan):
${tokenList}

Rules:
1. Return EXACTLY ${tokens.length} mappings, one per input token, preserving input order.
2. For each token that represents a word in the answer, return the matching word_index. Word-indices should advance through the answer as tokens do — duplicate words (e.g. multiple occurrences of "the") must be matched to the occurrence that fits the token's position in the reading flow.
3. Tokens that are NOT part of the student's answer — page artifacts ("5 | Page", "( 12 marks )"), stray dots, crossing-out marks, or garbled OCR fragments that the corrected text did not resolve — must have word_index = null.
4. When a single answer word was split into multiple tokens by Vision (e.g. "wall" + "puper" → "Wallpaper"), map each fragment to the same word_index. When a single token represents trailing punctuation attached to an answer word (e.g. a "." token following a "business" token, and the answer word is "business,"), map it to that same word_index.
5. If you cannot find a reasonable match for a token, prefer word_index = null over guessing — a null is recoverable client-side, a wrong index is not.

Return your answer as structured JSON matching the schema.`
}

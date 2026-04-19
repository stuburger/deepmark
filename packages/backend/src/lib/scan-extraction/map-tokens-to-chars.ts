import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import { outputSchema } from "@/lib/infra/output-schema"
import type { LlmRunner } from "@mcp-gcse/shared"
import { generateText } from "ai"
import {
	type AnswerWord,
	type MappingTokenInput,
	TokenCharMappingSchema,
	buildTokenCharMappingPrompt,
	splitAnswerWords,
} from "./map-tokens-to-chars-prompt"

export type MapTokensToCharsArgs = {
	/** LLM-authored, clean student answer in spatial reading order. */
	answerText: string
	/** Tokens in the same spatial reading order used to author `answerText`. */
	tokens: MappingTokenInput[]
	llm?: LlmRunner
}

export type TokenCharMapping = {
	token_index: number
	/** The answer word the LLM chose, or null for unmatched tokens. */
	word_index: number | null
	/** Inclusive start char offset into answer_text. Null if word_index is null. */
	char_start: number | null
	/** Exclusive end char offset into answer_text. Null if word_index is null. */
	char_end: number | null
}

export type MapTokensToCharsResult = {
	mappings: TokenCharMapping[]
	words: AnswerWord[]
}

/**
 * Maps each input token to the answer word it represents and the
 * corresponding char range in `answerText`.
 *
 * Replaces the client-side fuzzy alignment in
 * `apps/web/src/lib/marking/alignment/align.ts`. Because the attribution LLM
 * authored `answerText` from these tokens in spatial reading order, it can
 * emit the mapping directly instead of having the client guess via
 * Levenshtein + positional fill.
 *
 * Returns one mapping per input token, in input order. Unmatched tokens
 * (page artifacts, stray marks, unrecoverable OCR fragments) carry null
 * word_index/char_start/char_end.
 */
export async function mapTokensToChars({
	answerText,
	tokens,
	llm,
}: MapTokensToCharsArgs): Promise<MapTokensToCharsResult> {
	const words = splitAnswerWords(answerText)
	if (tokens.length === 0) return { mappings: [], words }

	const prompt = buildTokenCharMappingPrompt({ answerText, tokens })

	const { output } = await callLlmWithFallback(
		"token-char-mapping",
		async (model, entry, report) => {
			const result = await generateText({
				model,
				temperature: entry.temperature,
				messages: [
					{
						role: "user",
						content: [{ type: "text" as const, text: prompt }],
					},
				],
				output: outputSchema(TokenCharMappingSchema),
			})
			report.usage = result.usage
			return result
		},
		llm,
	)

	const mappings: TokenCharMapping[] = output.mappings.map((m) => {
		if (m.word_index === null) {
			return {
				token_index: m.token_index,
				word_index: null,
				char_start: null,
				char_end: null,
			}
		}
		const word = words[m.word_index]
		if (!word) {
			return {
				token_index: m.token_index,
				word_index: null,
				char_start: null,
				char_end: null,
			}
		}
		return {
			token_index: m.token_index,
			word_index: m.word_index,
			char_start: word.start,
			char_end: word.end,
		}
	})

	return { mappings, words }
}

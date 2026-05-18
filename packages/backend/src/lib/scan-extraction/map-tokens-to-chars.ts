import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import { logger } from "@/lib/infra/logger"
import { outputSchema } from "@/lib/infra/output-schema"
import type { LlmRunner, LlmTimeoutMs } from "@mcp-gcse/shared"
import { generateText } from "ai"
import {
	type AnswerWord,
	type MappingTokenInput,
	TokenCharMappingSchema,
	buildTokenCharMappingPrompt,
	splitAnswerWords,
} from "./map-tokens-to-chars-prompt"

const TAG = "map-tokens-to-chars"

/**
 * Tokens per LLM call. The schema demands one JSON entry per input
 * token, so the output size grows linearly with token count. Gemini
 * Flash's ~8k-token output budget caps a single call at ~250 mappings
 * before it truncates or fails to parse. Batching at 100 keeps every
 * call well under the limit with margin for the schema overhead and
 * avoids whole-question failure on long answers (Q6 of the Pearson
 * smoke had 938 tokens — one call dropped all of them).
 */
const TOKENS_PER_BATCH = 100

export type MapTokensToCharsArgs = {
	/** LLM-authored, clean student answer in spatial reading order. */
	answerText: string
	/** Tokens in the same spatial reading order used to author `answerText`. */
	tokens: MappingTokenInput[]
	llm?: LlmRunner
	/** Per-attempt wall-clock budget forwarded to the runner. */
	timeoutMs?: LlmTimeoutMs
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
 * Because the attribution LLM authored `answerText` from these tokens in
 * spatial reading order, it emits the mapping directly. Replaces all
 * fuzzy alignment in the pipeline — see CLAUDE.md.
 *
 * Chunks the token list into batches of TOKENS_PER_BATCH and runs the
 * LLM call once per batch (sequentially — bounded output per call avoids
 * truncation; the answer text is small so we can repeat it). Each batch
 * sees the FULL answer word list with absolute word indices, so the LLM
 * picks the same word_index regardless of batch boundary. Results from
 * all batches are concatenated in input token order.
 *
 * Returns one mapping per input token, in input order. Unmatched tokens
 * (page artifacts, stray marks, unrecoverable OCR fragments) carry null
 * word_index/char_start/char_end. If a batch fails, ALL tokens in that
 * batch carry null mappings — the rest of the question still maps.
 */
export async function mapTokensToChars({
	answerText,
	tokens,
	llm,
	timeoutMs,
}: MapTokensToCharsArgs): Promise<MapTokensToCharsResult> {
	const words = splitAnswerWords(answerText)
	if (tokens.length === 0) return { mappings: [], words }

	const batches: MappingTokenInput[][] = []
	for (let i = 0; i < tokens.length; i += TOKENS_PER_BATCH) {
		batches.push(tokens.slice(i, i + TOKENS_PER_BATCH))
	}

	const allMappings: TokenCharMapping[] = []
	let batchOffset = 0
	let failedBatches = 0

	for (const batch of batches) {
		try {
			const prompt = buildTokenCharMappingPrompt({
				answerText,
				tokens: batch,
			})
			const { output } = await callLlmWithFallback(
				"token-char-mapping",
				async (model, entry, report, signal) => {
					const result = await generateText({
						model,
						abortSignal: signal,
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
				{ llm, timeoutMs },
			)

			for (const m of output.mappings) {
				// The prompt addresses tokens 0..batch.length-1 within this
				// batch; absolute token index is batchOffset + m.token_index.
				const absIdx = batchOffset + m.token_index
				if (m.word_index === null) {
					allMappings.push({
						token_index: absIdx,
						word_index: null,
						char_start: null,
						char_end: null,
					})
					continue
				}
				const word = words[m.word_index]
				if (!word) {
					allMappings.push({
						token_index: absIdx,
						word_index: null,
						char_start: null,
						char_end: null,
					})
					continue
				}
				allMappings.push({
					token_index: absIdx,
					word_index: m.word_index,
					char_start: word.start,
					char_end: word.end,
				})
			}
		} catch (err) {
			failedBatches++
			// Emit null mappings for every token in the failed batch so
			// downstream gets a uniform array shape — and the warn below
			// makes the failure visible.
			for (let i = 0; i < batch.length; i++) {
				allMappings.push({
					token_index: batchOffset + i,
					word_index: null,
					char_start: null,
					char_end: null,
				})
			}
			logger.warn(TAG, "Token-char mapping batch failed", {
				batchIndex: batchOffset / TOKENS_PER_BATCH,
				batchSize: batch.length,
				error: String(err),
			})
		}
		batchOffset += batch.length
	}

	const mapped = allMappings.filter((m) => m.char_start !== null).length
	if (failedBatches > 0 || mapped < tokens.length * 0.9) {
		// Loud signal — silent low coverage was the bug Stuart saw twice.
		logger.warn(TAG, "Token-char mapping coverage low", {
			totalTokens: tokens.length,
			mapped,
			coverage: mapped / tokens.length,
			batches: batches.length,
			failedBatches,
		})
	} else {
		logger.info(TAG, "Token-char mapping complete", {
			totalTokens: tokens.length,
			mapped,
			batches: batches.length,
		})
	}

	return { mappings: allMappings, words }
}

import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import { logger } from "@/lib/infra/logger"
import { outputSchema } from "@/lib/infra/output-schema"
import type { LlmRunner } from "@mcp-gcse/shared"
import { generateText } from "ai"
import {
	MappingSchema,
	type PositionHint,
	buildMappingPrompt,
} from "./align-tokens-to-answer-prompt"

export type {
	AlignableToken,
	QuestionTokenGroup,
	TokenOffsetUpdate,
} from "./align-tokens-to-answer-core"
export {
	mapMappingsToOffsets,
	splitWithOffsets,
} from "./align-tokens-to-answer-core"

import {
	type AlignableToken,
	type QuestionTokenGroup,
	type TokenOffsetUpdate,
	type WordWithOffset,
	formatAnswerWords,
	formatTokenList,
	mapMappingsToOffsets,
	splitWithOffsets,
} from "./align-tokens-to-answer-core"

const TAG = "token-answer-align"

/** Max tokens per LLM call. Larger inputs are chunked and run in parallel. */
const CHUNK_SIZE = 100

/**
 * Calls LLM per question (parallel), returns update records.
 * Large token lists are chunked automatically.
 * No DB reads or writes — the caller owns side effects.
 */
export async function alignTokensToAnswers(
	questions: QuestionTokenGroup[],
	llm?: LlmRunner,
): Promise<TokenOffsetUpdate[]> {
	const eligible = questions.filter(
		(q) => q.tokens.length > 0 && q.answerText.trim().length > 0,
	)

	if (eligible.length === 0) return []

	const questionUpdates = await Promise.all(
		eligible.map(async (q) => {
			const answerWords = splitWithOffsets(q.answerText)
			if (answerWords.length === 0) return []

			const chunks = chunkTokens(q.tokens, CHUNK_SIZE)

			const chunkResults = await Promise.all(
				chunks.map((chunk, i) =>
					alignChunk(
						chunk,
						answerWords,
						q.questionNumber,
						chunks.length > 1
							? {
									chunkIndex: i,
									totalChunks: chunks.length,
									tokenOffset: i * CHUNK_SIZE,
									totalTokens: q.tokens.length,
								}
							: undefined,
						llm,
					),
				),
			)

			const updates = chunkResults.flat()

			const mapped = updates.filter((u) => u.charStart != null).length
			logger.info(TAG, "Token mapping complete", {
				questionNumber: q.questionNumber,
				tokens: q.tokens.length,
				chunks: chunks.length,
				mapped,
			})

			return updates
		}),
	)

	return questionUpdates.flat()
}

function chunkTokens(
	tokens: AlignableToken[],
	size: number,
): AlignableToken[][] {
	if (tokens.length <= size) return [tokens]
	const chunks: AlignableToken[][] = []
	for (let i = 0; i < tokens.length; i += size) {
		chunks.push(tokens.slice(i, i + size))
	}
	return chunks
}

async function alignChunk(
	tokens: AlignableToken[],
	answerWords: WordWithOffset[],
	questionNumber: string,
	positionHint: PositionHint | undefined,
	llm?: LlmRunner,
): Promise<TokenOffsetUpdate[]> {
	const tokenList = formatTokenList(tokens)
	const answerWordList = formatAnswerWords(answerWords)
	const prompt = buildMappingPrompt(
		tokenList,
		answerWordList,
		questionNumber,
		positionHint,
	)

	const { output } = await callLlmWithFallback(
		"token-answer-mapping",
		async (model, entry, report) => {
			const result = await generateText({
				model,
				temperature: entry.temperature,
				messages: [{ role: "user", content: prompt }],
				output: outputSchema(MappingSchema),
			})
			report.usage = result.usage
			return result
		},
		llm,
	)

	// Filter to valid token indices — LLMs occasionally hallucinate extra entries
	const valid = output.mappings.filter(
		(m) => m.token_index >= 0 && m.token_index < tokens.length,
	)

	// Deduplicate: keep first mapping per token_index
	const seen = new Set<number>()
	const deduped = valid.filter((m) => {
		if (seen.has(m.token_index)) return false
		seen.add(m.token_index)
		return true
	})

	const chunkLabel = positionHint
		? ` chunk ${positionHint.chunkIndex + 1}/${positionHint.totalChunks}`
		: ""

	if (deduped.length !== tokens.length) {
		logger.warn(TAG, "Mapping count mismatch — proceeding with available mappings", {
			questionNumber,
			chunkLabel,
			expected: tokens.length,
			received: output.mappings.length,
			valid: deduped.length,
		})
	}

	return mapMappingsToOffsets(deduped, tokens, answerWords)
}

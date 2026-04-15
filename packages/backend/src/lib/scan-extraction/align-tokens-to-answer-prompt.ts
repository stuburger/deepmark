import { z } from "zod/v4"

export const MappingSchema = z.object({
	mappings: z
		.array(
			z.object({
				token_index: z.number().describe("0-based index into the token list"),
				answer_word_index: z
					.number()
					.describe(
						"0-based index into the answer words list. -1 if this token does not map to any answer word (junk/misattributed)",
					),
				text_corrected: z
					.string()
					.describe(
						"The correctly-read word. Use the answer word's spelling if the OCR token is a clear misread; otherwise copy the raw text as-is",
					),
			}),
		)
		.describe("One entry per token — every token must appear exactly once"),
})

export type PositionHint = {
	chunkIndex: number
	totalChunks: number
	tokenOffset: number
	totalTokens: number
}

function describePosition(hint: PositionHint): string {
	if (hint.chunkIndex === 0) return "beginning"
	if (hint.chunkIndex === hint.totalChunks - 1) return "end"
	const pct = Math.round(
		((hint.tokenOffset + 50) / hint.totalTokens) * 100,
	)
	return `middle (~${pct}% through)`
}

export function buildMappingPrompt(
	tokenList: string,
	answerWordList: string,
	questionNumber: string,
	positionHint?: PositionHint,
): string {
	const positionBlock = positionHint
		? `\n\n**Position context:** These tokens come from the ${describePosition(positionHint)} of the student's answer. Earlier/later tokens are handled separately — focus on the portion of the answer that these tokens correspond to. IMPORTANT: token_index values in your output must match the [N] indices shown in the token list above (starting from 0), NOT global positions.`
		: ""

	return `You are mapping OCR word tokens from a student's exam script to the corresponding words in a transcribed answer.

## Question ${questionNumber}

**OCR tokens** (raw text from optical character recognition — may contain errors):
${tokenList}

**Answer words** (the correct transcription of this answer):
${answerWordList}${positionBlock}

## Task

For each OCR token, determine which answer word it corresponds to. Return a JSON object with a "mappings" array containing one entry per token:

- token_index: the 0-based position in the OCR tokens list
- answer_word_index: the 0-based position in the answer words list, or -1 if this token is junk (from a different question, duplicated by OCR, or doesn't map to any answer word)
- text_corrected: what the word actually says — use the answer word's spelling if the OCR token is a clear misread of it, otherwise copy the raw text as-is

Rules:
- Every token must appear exactly once in the output
- Multiple tokens can map to the same answer word (if OCR split one word into pieces)
- Tokens that are clearly from a different answer or are OCR artifacts should get answer_word_index: -1
- Preserve the answer word ordering — mappings should generally increase in answer_word_index`
}

import type { PageToken } from "../types"
import { normalizedDistance, splitWithOffsets } from "./string-utils"
import type { TokenAlignment } from "./types"

const MAX_DISTANCE = 0.4
const LOOK_AHEAD = 3
const MIN_CONFIDENCE = 0.5

/**
 * Aligns OCR tokens to character positions in the student_answer string
 * using fuzzy word-level matching with advancing cursors.
 */
export function alignTokensToAnswer(
	answer: string,
	tokens: PageToken[],
): TokenAlignment {
	if (tokens.length === 0 || answer.length === 0) {
		return { tokenMap: {}, confidence: 0 }
	}

	const answerWords = splitWithOffsets(answer)
	const tokenMap: Record<string, { start: number; end: number }> = {}
	let alignedCount = 0
	let wordCursor = 0

	for (const token of tokens) {
		const tokenText = (token.text_corrected ?? token.text_raw).toLowerCase()
		if (tokenText.length === 0) continue

		let bestIdx = -1
		let bestDist = Number.POSITIVE_INFINITY

		// Search within a look-ahead window from the current cursor
		const searchEnd = Math.min(wordCursor + LOOK_AHEAD, answerWords.length)
		for (let i = wordCursor; i < searchEnd; i++) {
			const dist = normalizedDistance(
				tokenText,
				answerWords[i].word.toLowerCase(),
			)
			if (dist < bestDist) {
				bestDist = dist
				bestIdx = i
			}
		}

		if (bestIdx >= 0 && bestDist <= MAX_DISTANCE) {
			const aw = answerWords[bestIdx]
			tokenMap[token.id] = { start: aw.start, end: aw.end }
			wordCursor = bestIdx + 1
			alignedCount++
		}
	}

	const confidence = alignedCount / tokens.length

	if (confidence < MIN_CONFIDENCE) {
		return { tokenMap: {}, confidence }
	}

	return { tokenMap, confidence }
}

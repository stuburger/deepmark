import type { PageToken } from "../types"
import { normalizedDistance, splitWithOffsets } from "./string-utils"
import type { TokenAlignment } from "./types"

const MAX_DISTANCE = 0.4
const LOOK_AHEAD = 8

/**
 * Two-pass alignment of OCR tokens to character positions in student_answer.
 *
 * Pass 1 (fuzzy): walks tokens and answer words with advancing cursors,
 * matching via Levenshtein distance. Unmatched tokens are skipped.
 *
 * Pass 2 (positional fill): unmatched tokens are assigned to the nearest
 * unassigned answer word by position, so every token gets a mapping when
 * possible — even garbled OCR.
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
	const assignedWordIndices = new Set<number>()
	let wordCursor = 0
	let fuzzyCount = 0

	for (const token of tokens) {
		if (wordCursor >= answerWords.length) break

		// Race both raw and corrected token forms against each candidate word
		// and take the best distance. The extract LLM's correction is usually
		// right (recovering Vision misreads) but occasionally over-corrects;
		// keeping raw in the running means we never produce a *worse* match
		// than the single-form aligner.
		const rawText = token.text_raw.toLowerCase()
		const correctedText = token.text_corrected?.toLowerCase()
		const candidates =
			correctedText && correctedText.length > 0 && correctedText !== rawText
				? [rawText, correctedText]
				: [rawText]
		if (rawText.length === 0 && !correctedText) continue

		let bestIdx = -1
		let bestDist = Number.POSITIVE_INFINITY

		const searchEnd = Math.min(wordCursor + LOOK_AHEAD, answerWords.length)
		for (let i = wordCursor; i < searchEnd; i++) {
			const wordText = answerWords[i].word.toLowerCase()
			for (const candidate of candidates) {
				if (candidate.length === 0) continue
				const dist = normalizedDistance(candidate, wordText)
				if (dist < bestDist) {
					bestDist = dist
					bestIdx = i
				}
			}
		}

		if (bestIdx >= 0 && bestDist <= MAX_DISTANCE) {
			const aw = answerWords[bestIdx]
			tokenMap[token.id] = { start: aw.start, end: aw.end }
			assignedWordIndices.add(bestIdx)
			wordCursor = bestIdx + 1
			fuzzyCount++
		}
	}

	const unmatchedTokens = tokens.filter((t) => !tokenMap[t.id])
	if (unmatchedTokens.length > 0 && assignedWordIndices.size > 0) {
		const freeWords: number[] = []
		for (let i = 0; i < answerWords.length; i++) {
			if (!assignedWordIndices.has(i)) freeWords.push(i)
		}

		const limit = Math.min(unmatchedTokens.length, freeWords.length)
		for (let i = 0; i < limit; i++) {
			const token = unmatchedTokens[i]
			const wordIdx = freeWords[i]
			const aw = answerWords[wordIdx]
			tokenMap[token.id] = { start: aw.start, end: aw.end }
		}
	}

	const confidence = fuzzyCount / tokens.length

	return { tokenMap, confidence }
}

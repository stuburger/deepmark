import type { PageToken } from "../types"
import { longestIncreasingSubsequence } from "./lis"
import { normalizedDistance } from "./string-utils"
import type { WordWithOffset } from "./types"

/**
 * An anchor is a (token, answerWord) pair we trust enough to lock at a
 * known clean-text position BEFORE the main Levenshtein walk. Anchors act
 * as cursor checkpoints — the main pass can never drift past one.
 *
 * Stored as array indices into the token / answer-word arrays the anchor
 * pass was called with. Callers must not reorder either array after
 * receiving anchors.
 */
export type Anchor = {
	tokenIndex: number
	wordIndex: number
}

export type AnchorOptions = {
	/**
	 * Minimum character length of a token (or answer word) to be considered
	 * for anchoring. Short tokens like `to`, `the`, `a` are too ambiguous —
	 * Vision misreads on them propagate the cursor.
	 */
	minLength: number
	/**
	 * Minimum Cloud Vision OCR confidence (0–1) for a token to be considered.
	 * Below this, the token's reading is too uncertain to act as a checkpoint.
	 * Tokens with null confidence are treated as 0 (rejected).
	 */
	minConfidence: number
	/**
	 * Maximum normalised Levenshtein distance between a token's text and the
	 * candidate answer word. Stricter than the main-pass threshold — anchors
	 * earn their authority by being CLOSE matches, not just any match.
	 */
	maxDistance: number
}

export const DEFAULT_ANCHOR_OPTIONS: AnchorOptions = {
	minLength: 5,
	minConfidence: 0.5,
	maxDistance: 0.2,
}

/**
 * Identifies anchor (tokenIdx, wordIdx) pairs from a token stream.
 *
 * Pipeline:
 *   1. Filter tokens to length / confidence-qualifying candidates.
 *   2. For each candidate, find its best matching answer word under the
 *      distance threshold.
 *   3. Reject matches where the answer word is not UNIQUE in the answer
 *      (would be ambiguous as a cursor checkpoint).
 *   4. Filter the resulting list to the longest monotonically-increasing
 *      subsequence by wordIndex (LIS). One rogue anchor that fuzzy-matches
 *      a word far ahead of its peers gets dropped automatically.
 *
 * Returns anchors in (tokenIndex, wordIndex) ascending order.
 */
export function identifyAnchors(
	tokens: ReadonlyArray<PageToken>,
	answerWords: ReadonlyArray<WordWithOffset>,
	options: AnchorOptions = DEFAULT_ANCHOR_OPTIONS,
): Anchor[] {
	// Lowercased answer-word frequency. Used to reject ambiguous matches —
	// a candidate that matches a word appearing 4× in the answer can't tell
	// the walker WHICH occurrence the token meant.
	const wordTextCounts = new Map<string, number>()
	for (const w of answerWords) {
		const key = w.word.toLowerCase()
		wordTextCounts.set(key, (wordTextCounts.get(key) ?? 0) + 1)
	}

	const candidates: Anchor[] = []
	for (let ti = 0; ti < tokens.length; ti++) {
		const token = tokens[ti]
		const tokenForms = tokenCandidates(token)
		const longest = tokenForms.reduce(
			(acc, c) => (c.length > acc ? c.length : acc),
			0,
		)
		if (longest < options.minLength) continue
		if ((token.confidence ?? 0) < options.minConfidence) continue

		const best = bestWordMatch(tokenForms, answerWords, options)
		if (!best) continue

		const matchedKey = answerWords[best.wordIndex].word.toLowerCase()
		if ((wordTextCounts.get(matchedKey) ?? 0) > 1) continue

		candidates.push({ tokenIndex: ti, wordIndex: best.wordIndex })
	}

	// Outlier suppression: keep the maximum monotonic subset by wordIndex.
	// A single mis-anchored token (e.g. an OCR misread that close-matches a
	// word in a much later paragraph) would otherwise disqualify every
	// legitimate later anchor — see `lis.ts` for the algorithmic details.
	return longestIncreasingSubsequence(candidates, (a) => a.wordIndex)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Race raw + corrected token text against each candidate word. The extract
 * LLM's correction is usually right (recovers Vision misreads) but
 * occasionally over-corrects; keeping both in the running means we never
 * produce a worse match than the single-form aligner.
 *
 * Returns an empty array when neither form has content.
 */
export function tokenCandidates(token: PageToken): string[] {
	const rawText = token.text_raw.toLowerCase()
	const correctedText = token.text_corrected?.toLowerCase()
	const hasRaw = rawText.length > 0
	const hasCorrected =
		correctedText !== undefined &&
		correctedText !== null &&
		correctedText.length > 0
	if (!hasRaw && !hasCorrected) return []
	if (hasCorrected && correctedText !== rawText) {
		return hasRaw ? [rawText, correctedText] : [correctedText]
	}
	return [rawText]
}

type WordMatch = { wordIndex: number; distance: number }

/**
 * Finds the best matching answer word for any of the given token forms
 * (raw / corrected). Returns null when no word is within `maxDistance`
 * or when no answer word meets the minimum length threshold.
 */
function bestWordMatch(
	tokenForms: string[],
	answerWords: ReadonlyArray<WordWithOffset>,
	options: AnchorOptions,
): WordMatch | null {
	let bestIdx = -1
	let bestDist = Number.POSITIVE_INFINITY
	for (let wi = 0; wi < answerWords.length; wi++) {
		const wordText = answerWords[wi].word.toLowerCase()
		if (wordText.length < options.minLength) continue
		for (const candidate of tokenForms) {
			const dist = normalizedDistance(candidate, wordText)
			if (dist < bestDist) {
				bestDist = dist
				bestIdx = wi
			}
		}
	}
	if (bestIdx < 0 || bestDist > options.maxDistance) return null
	return { wordIndex: bestIdx, distance: bestDist }
}

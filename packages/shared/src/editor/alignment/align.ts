import type { PageToken } from "../types"
import { normalizedDistance, splitWithOffsets } from "./string-utils"
import type { TokenAlignment } from "./types"

const MAX_DISTANCE = 0.4
const LOOK_AHEAD = 8

// ─── Anchor pass tuning ─────────────────────────────────────────────────────
// An anchor is a token we trust enough to lock at a known clean-text position
// BEFORE the main Levenshtein walk. Anchors act as cursor checkpoints — the
// main pass can never drift past one. Three signals make a strong anchor:
//
//   1. Length — short tokens (`to`, `the`) are too ambiguous; we require ≥ 5.
//   2. Vision confidence — OCR is sure about this word's reading.
//   3. Distinctiveness — the matched clean-text word must be unique enough
//      that we know which occurrence the token refers to.
//
// Together they identify words like "Broughton", "pandemonium", "boarding"
// — anchors a Vision misread on a common short word can't jump past.
const ANCHOR_MIN_LENGTH = 5
const ANCHOR_MIN_CONFIDENCE = 0.5
const ANCHOR_MAX_DISTANCE = 0.2

type AnswerWord = { word: string; start: number; end: number }

type Anchor = {
	tokenIndex: number
	wordIndex: number
}

/**
 * Three-pass alignment of OCR tokens to character positions in student_answer.
 *
 * Pass 0 (anchors): identify high-confidence + long + locally-unique tokens
 * and lock them at known clean-text positions. These are cursor checkpoints
 * that the main walker cannot drift past.
 *
 * Pass 1 (fuzzy): walks tokens between consecutive anchors and within their
 * cursor windows, matching via Levenshtein distance. Cursor is bounded by
 * the next anchor's position — preventing the "common-word misread jumps
 * cursor to a later occurrence" failure mode that breaks long answers.
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
	let fuzzyCount = 0

	// ── Pass 0 — anchor identification ──────────────────────────────────
	const anchors = identifyAnchors(tokens, answerWords)
	for (const a of anchors) {
		const token = tokens[a.tokenIndex]
		const word = answerWords[a.wordIndex]
		tokenMap[token.id] = { start: word.start, end: word.end }
		assignedWordIndices.add(a.wordIndex)
		fuzzyCount++
	}

	// ── Pass 1 — Levenshtein walk between anchors ────────────────────────
	// Anchors partition the tokens into segments. Within each segment, the
	// cursor is bounded by the segment's word range, so a common-word
	// misread can drift at most until the next anchor — bounded damage.
	const segments = buildSegments(anchors, tokens.length, answerWords.length)
	for (const seg of segments) {
		let wordCursor = seg.wordStart
		for (let ti = seg.tokenStart; ti < seg.tokenEnd; ti++) {
			const token = tokens[ti]
			if (tokenMap[token.id]) continue // already anchored
			if (wordCursor >= seg.wordEnd) break

			const candidates = tokenCandidates(token)
			if (candidates.length === 0) continue

			let bestIdx = -1
			let bestDist = Number.POSITIVE_INFINITY

			const searchEnd = Math.min(wordCursor + LOOK_AHEAD, seg.wordEnd)
			for (let i = wordCursor; i < searchEnd; i++) {
				if (assignedWordIndices.has(i)) continue
				const wordText = answerWords[i].word.toLowerCase()
				for (const candidate of candidates) {
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
	}

	// ── Pass 2 — positional fill for unmatched tokens ────────────────────
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

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Race raw + corrected token text against each candidate word. */
function tokenCandidates(token: PageToken): string[] {
	const rawText = token.text_raw.toLowerCase()
	const correctedText = token.text_corrected?.toLowerCase()
	if (rawText.length === 0 && (!correctedText || correctedText.length === 0)) {
		return []
	}
	if (correctedText && correctedText.length > 0 && correctedText !== rawText) {
		return rawText.length > 0 ? [rawText, correctedText] : [correctedText]
	}
	return [rawText]
}

/**
 * Walks tokens once, collecting (tokenIndex, wordIndex) pairs that pass the
 * anchor criteria. Then filters to maintain strict monotonicity — a later
 * token cannot anchor to an earlier word position than a prior anchor, or
 * we'd be claiming the cursor went backwards.
 */
function identifyAnchors(
	tokens: PageToken[],
	answerWords: AnswerWord[],
): Anchor[] {
	// Index clean-text words by their lowercase form. Used to test uniqueness:
	// a candidate word is anchor-worthy only if it appears exactly ONCE in
	// the full answer (Levenshtein-equal matches included via the inner loop).
	const wordTextCounts = new Map<string, number>()
	for (const w of answerWords) {
		const key = w.word.toLowerCase()
		wordTextCounts.set(key, (wordTextCounts.get(key) ?? 0) + 1)
	}

	const rawAnchors: Anchor[] = []
	for (let ti = 0; ti < tokens.length; ti++) {
		const token = tokens[ti]
		const candidates = tokenCandidates(token)
		const longest = candidates.reduce(
			(acc, c) => (c.length > acc ? c.length : acc),
			0,
		)
		if (longest < ANCHOR_MIN_LENGTH) continue
		const confidence = token.confidence ?? 0
		if (confidence < ANCHOR_MIN_CONFIDENCE) continue

		let bestIdx = -1
		let bestDist = Number.POSITIVE_INFINITY
		for (let wi = 0; wi < answerWords.length; wi++) {
			const wordText = answerWords[wi].word.toLowerCase()
			if (wordText.length < ANCHOR_MIN_LENGTH) continue
			for (const candidate of candidates) {
				const dist = normalizedDistance(candidate, wordText)
				if (dist < bestDist) {
					bestDist = dist
					bestIdx = wi
				}
			}
		}
		if (bestIdx < 0 || bestDist > ANCHOR_MAX_DISTANCE) continue

		// Uniqueness: the matched word's exact spelling must appear ≤ 1×
		// across the answer. Common words like "narrator" appear many times
		// and are unsafe anchors even if they pass the distance threshold.
		const matchedKey = answerWords[bestIdx].word.toLowerCase()
		if ((wordTextCounts.get(matchedKey) ?? 0) > 1) continue

		rawAnchors.push({ tokenIndex: ti, wordIndex: bestIdx })
	}

	// Keep the maximum set of monotonic anchors via longest-increasing-
	// subsequence on wordIndex. A naive greedy "keep if strictly greater
	// than prev" filter is too eager — one rogue anchor (e.g. an OCR
	// misread that fuzzy-matches a word in a much later paragraph) can
	// drop the cursor far forward and disqualify every legitimate anchor
	// after it. LIS automatically isolates outliers like that.
	//
	// rawAnchors is already in tokenIndex order (we walked tokens in
	// order), so we just need LIS by wordIndex. O(n²) is fine here — anchor
	// counts are in the dozens, not thousands.
	return longestIncreasingSubsequence(rawAnchors)
}

function longestIncreasingSubsequence(anchors: Anchor[]): Anchor[] {
	const n = anchors.length
	if (n <= 1) return anchors.slice()
	// dp[i] = length of LIS ending at i; prev[i] = index of predecessor
	const dp = new Array<number>(n).fill(1)
	const prev = new Array<number>(n).fill(-1)
	let bestEnd = 0
	for (let i = 1; i < n; i++) {
		for (let j = 0; j < i; j++) {
			if (
				anchors[j].wordIndex < anchors[i].wordIndex &&
				dp[j] + 1 > dp[i]
			) {
				dp[i] = dp[j] + 1
				prev[i] = j
			}
		}
		if (dp[i] > dp[bestEnd]) bestEnd = i
	}
	const out: Anchor[] = []
	for (let k: number = bestEnd; k !== -1; k = prev[k]) out.push(anchors[k])
	return out.reverse()
}

type Segment = {
	tokenStart: number
	tokenEnd: number
	wordStart: number
	wordEnd: number
}

/**
 * Carves the (tokens × words) plane into segments bounded by anchors. The
 * Levenshtein walker runs once per segment with the cursor constrained to
 * that segment's word window — so a misread cannot pull the cursor across
 * an anchor.
 */
function buildSegments(
	anchors: Anchor[],
	tokenCount: number,
	wordCount: number,
): Segment[] {
	if (anchors.length === 0) {
		return [
			{ tokenStart: 0, tokenEnd: tokenCount, wordStart: 0, wordEnd: wordCount },
		]
	}
	const segments: Segment[] = []
	let prevTokenEnd = 0
	let prevWordEnd = 0
	for (const a of anchors) {
		if (a.tokenIndex > prevTokenEnd) {
			segments.push({
				tokenStart: prevTokenEnd,
				tokenEnd: a.tokenIndex,
				wordStart: prevWordEnd,
				wordEnd: a.wordIndex,
			})
		}
		prevTokenEnd = a.tokenIndex + 1
		prevWordEnd = a.wordIndex + 1
	}
	if (prevTokenEnd < tokenCount) {
		segments.push({
			tokenStart: prevTokenEnd,
			tokenEnd: tokenCount,
			wordStart: prevWordEnd,
			wordEnd: wordCount,
		})
	}
	return segments
}

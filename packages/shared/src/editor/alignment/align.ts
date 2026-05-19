import type { PageToken } from "../types"
import {
	type AnchorOptions,
	DEFAULT_ANCHOR_OPTIONS,
	identifyAnchors,
	tokenCandidates,
} from "./anchors"
import { buildSegments } from "./segments"
import { normalizedDistance, splitWithOffsets } from "./string-utils"
import type { TokenAlignment, WordWithOffset } from "./types"

export type AlignmentOptions = {
	/** Anchor-pass thresholds. See `anchors.ts` for the semantics. */
	anchor?: Partial<AnchorOptions>
	/**
	 * Maximum normalised Levenshtein distance for a token-to-word match in
	 * the main pass. Looser than the anchor threshold because we accept
	 * "best of the candidates within the window" — the bounded segment
	 * limits how wrong the cursor can drift.
	 */
	mainPassMaxDistance?: number
	/**
	 * How many words ahead of the cursor the main pass scans for a match.
	 * A common-word misread can only drift within this window per token.
	 */
	mainPassLookAhead?: number
}

const DEFAULT_OPTIONS = {
	mainPassMaxDistance: 0.4,
	mainPassLookAhead: 8,
} as const

/**
 * Three-pass alignment of OCR tokens to character positions in
 * `student_answer`. The aligner is fuzzy by design — Vision OCR
 * misreads handwriting and the LLM rewrites the answer text, so an
 * exact match is impossible. We instead bound how badly fuzzy matching
 * can go wrong.
 *
 *   Pass 0 (anchors): `anchors.ts` collects high-confidence + long +
 *     locally-unique tokens and locks them at known clean-text
 *     positions. LIS-filtered for outlier resistance.
 *   Pass 1 (bounded Levenshtein): walks tokens between consecutive
 *     anchors. Cursor is constrained to each segment's word window —
 *     a common-word misread can drift at most until the next anchor.
 *   Pass 2 (positional fill): unmatched tokens get free answer words
 *     by order. Garbage-in tokens (broken punctuation, low-confidence
 *     scribbles) still get a mapping, just an approximate one.
 *
 * Returns `tokenMap[tokenId] = {start, end}` for every token that
 * received a position. `confidence` is the fraction of tokens placed
 * by passes 0+1 (i.e. by structural means, not positional fill).
 */
export function alignTokensToAnswer(
	answer: string,
	tokens: PageToken[],
	options: AlignmentOptions = {},
): TokenAlignment {
	if (tokens.length === 0 || answer.length === 0) {
		return { tokenMap: {}, confidence: 0 }
	}

	const anchorOptions: AnchorOptions = {
		...DEFAULT_ANCHOR_OPTIONS,
		...(options.anchor ?? {}),
	}
	const mainPassMaxDistance =
		options.mainPassMaxDistance ?? DEFAULT_OPTIONS.mainPassMaxDistance
	const mainPassLookAhead =
		options.mainPassLookAhead ?? DEFAULT_OPTIONS.mainPassLookAhead

	const answerWords = splitWithOffsets(answer)
	const tokenMap: Record<string, { start: number; end: number }> = {}
	const assignedWordIndices = new Set<number>()
	let structuralCount = 0

	// ── Pass 0 — lock anchors ───────────────────────────────────────────
	const anchors = identifyAnchors(tokens, answerWords, anchorOptions)
	for (const a of anchors) {
		const token = tokens[a.tokenIndex]
		const word = answerWords[a.wordIndex]
		tokenMap[token.id] = { start: word.start, end: word.end }
		assignedWordIndices.add(a.wordIndex)
		structuralCount++
	}

	// ── Pass 1 — bounded Levenshtein in each segment ────────────────────
	const segments = buildSegments(anchors, tokens.length, answerWords.length)
	for (const seg of segments) {
		structuralCount += runMainPassSegment({
			tokens,
			answerWords,
			tokenStart: seg.tokenStart,
			tokenEnd: seg.tokenEnd,
			wordStart: seg.wordStart,
			wordEnd: seg.wordEnd,
			tokenMap,
			assignedWordIndices,
			maxDistance: mainPassMaxDistance,
			lookAhead: mainPassLookAhead,
		})
	}

	// ── Pass 2 — positional fill for unmatched tokens ───────────────────
	positionalFill({ tokens, answerWords, tokenMap, assignedWordIndices })

	const confidence = structuralCount / tokens.length
	return { tokenMap, confidence }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function runMainPassSegment(args: {
	tokens: ReadonlyArray<PageToken>
	answerWords: ReadonlyArray<WordWithOffset>
	tokenStart: number
	tokenEnd: number
	wordStart: number
	wordEnd: number
	tokenMap: Record<string, { start: number; end: number }>
	assignedWordIndices: Set<number>
	maxDistance: number
	lookAhead: number
}): number {
	let wordCursor = args.wordStart
	let placed = 0
	for (let ti = args.tokenStart; ti < args.tokenEnd; ti++) {
		const token = args.tokens[ti]
		if (args.tokenMap[token.id]) continue
		if (wordCursor >= args.wordEnd) break

		const candidates = tokenCandidates(token)
		if (candidates.length === 0) continue

		let bestIdx = -1
		let bestDist = Number.POSITIVE_INFINITY
		const searchEnd = Math.min(wordCursor + args.lookAhead, args.wordEnd)
		for (let i = wordCursor; i < searchEnd; i++) {
			if (args.assignedWordIndices.has(i)) continue
			const wordText = args.answerWords[i].word.toLowerCase()
			for (const candidate of candidates) {
				const dist = normalizedDistance(candidate, wordText)
				if (dist < bestDist) {
					bestDist = dist
					bestIdx = i
				}
			}
		}

		if (bestIdx >= 0 && bestDist <= args.maxDistance) {
			const aw = args.answerWords[bestIdx]
			args.tokenMap[token.id] = { start: aw.start, end: aw.end }
			args.assignedWordIndices.add(bestIdx)
			wordCursor = bestIdx + 1
			placed++
		}
	}
	return placed
}

function positionalFill(args: {
	tokens: ReadonlyArray<PageToken>
	answerWords: ReadonlyArray<WordWithOffset>
	tokenMap: Record<string, { start: number; end: number }>
	assignedWordIndices: Set<number>
}): void {
	const unmatchedTokens = args.tokens.filter((t) => !args.tokenMap[t.id])
	if (unmatchedTokens.length === 0 || args.assignedWordIndices.size === 0) {
		return
	}
	const freeWords: number[] = []
	for (let i = 0; i < args.answerWords.length; i++) {
		if (!args.assignedWordIndices.has(i)) freeWords.push(i)
	}
	const limit = Math.min(unmatchedTokens.length, freeWords.length)
	for (let i = 0; i < limit; i++) {
		const token = unmatchedTokens[i]
		const wordIdx = freeWords[i]
		const aw = args.answerWords[wordIdx]
		args.tokenMap[token.id] = { start: aw.start, end: aw.end }
	}
}

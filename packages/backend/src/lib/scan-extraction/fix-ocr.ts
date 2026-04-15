import { logger } from "@/lib/infra/logger"
import { sortTokensSpatially } from "./spatial-sort"

const TAG = "fix-ocr"

// ─── Levenshtein helpers ────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
	const m = a.length
	const n = b.length
	if (m === 0) return n
	if (n === 0) return m

	let prev = Array.from({ length: n + 1 }, (_, i) => i)
	for (let i = 1; i <= m; i++) {
		const curr = [i]
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1
			curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
		}
		prev = curr
	}
	return prev[n]
}

function normalizedDistance(a: string, b: string): number {
	const maxLen = Math.max(a.length, b.length)
	if (maxLen === 0) return 0
	return levenshtein(a, b) / maxLen
}

// ─── Config ─────────────────────────────────────────────────────────────────

/**
 * Maximum normalised Levenshtein distance to accept a correction.
 * 0.4 allows ~40% of characters to differ — enough to catch real OCR misreads
 * ("damodged"→"damaged") while rejecting unrelated words ("post"→"of").
 */
const MAX_DISTANCE = 0.4

/**
 * How many transcript words to look ahead when searching for a match.
 * Keeps the cursor from drifting too far on a single unmatched token.
 */
const LOOK_AHEAD = 8

// ─── Types ───────────────────────────────────────────────────────────────────

type RawToken = {
	id: string
	page_order: number
	para_index: number
	line_index: number
	word_index: number
	text_raw: string
	bbox: unknown
}

export type OcrCorrection = {
	id: string
	textCorrected: string
}

// ─── Core ────────────────────────────────────────────────────────────────────

function correctPage(tokens: RawToken[], transcript: string): OcrCorrection[] {
	const transcriptWords = transcript.match(/\S+/g) ?? []
	if (transcriptWords.length === 0 || tokens.length === 0) return []

	const corrections: OcrCorrection[] = []
	let cursor = 0

	for (const token of tokens) {
		if (cursor >= transcriptWords.length) break

		const rawLower = token.text_raw.toLowerCase()
		if (rawLower.length === 0) continue

		// Search the next LOOK_AHEAD transcript words for a close match.
		const searchEnd = Math.min(cursor + LOOK_AHEAD, transcriptWords.length)
		let bestIdx = -1
		let bestDist = Number.POSITIVE_INFINITY

		for (let i = cursor; i < searchEnd; i++) {
			const dist = normalizedDistance(
				rawLower,
				transcriptWords[i].toLowerCase(),
			)
			if (dist < bestDist) {
				bestDist = dist
				bestIdx = i
			}
		}

		if (bestIdx >= 0 && bestDist <= MAX_DISTANCE) {
			const transcriptWord = transcriptWords[bestIdx]
			if (transcriptWord !== token.text_raw) {
				corrections.push({ id: token.id, textCorrected: transcriptWord })
			}
			cursor = bestIdx + 1
		}
	}

	return corrections
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Corrects Cloud Vision OCR token text against Gemini page transcripts using
 * Levenshtein distance alignment. Only corrects tokens where:
 *   1. The transcript word is a close fuzzy match (normalised distance ≤ 0.4).
 *   2. The corrected word actually differs from the raw text.
 *
 * Completely different words are left alone — this catches genuine OCR
 * misreads ("damodged"→"damaged") without corrupting unrelated tokens
 * ("post"→"of" would be rejected because distance > 0.4).
 *
 * Deterministic — no LLM call.
 */
export function fixOcrTokens({
	tokens,
	pageTranscripts,
	jobId,
}: {
	tokens: RawToken[]
	pageTranscripts: Map<number, string>
	jobId: string
}): OcrCorrection[] {
	if (tokens.length === 0) return []

	// Group and sort tokens by page in reading order.
	const tokensByPage = new Map<number, RawToken[]>()
	for (const t of tokens) {
		const list = tokensByPage.get(t.page_order) ?? []
		list.push(t)
		tokensByPage.set(t.page_order, list)
	}
	for (const [pageOrder, pageTokens] of tokensByPage) {
		tokensByPage.set(pageOrder, sortTokensSpatially(pageTokens))
	}

	const allCorrections: OcrCorrection[] = []

	for (const [pageOrder, pageTokens] of tokensByPage) {
		const transcript = pageTranscripts.get(pageOrder)
		if (!transcript?.trim()) continue

		const corrections = correctPage(pageTokens, transcript)
		allCorrections.push(...corrections)
	}

	if (allCorrections.length > 0) {
		logger.info(TAG, "OCR correction complete", {
			jobId,
			total_tokens: tokens.length,
			corrected: allCorrections.length,
			pages: tokensByPage.size,
		})
	}

	return allCorrections
}

/**
 * Merges corrections back onto a token array, producing a new array with
 * `text_corrected` populated where a correction was found.
 */
export function mergeOcrCorrections<T extends { id: string }>(
	tokens: T[],
	corrections: OcrCorrection[],
): Array<T & { text_corrected: string | null }> {
	const byId = new Map(corrections.map((c) => [c.id, c.textCorrected]))
	return tokens.map((t) => ({
		...t,
		text_corrected: byId.get(t.id) ?? null,
	}))
}

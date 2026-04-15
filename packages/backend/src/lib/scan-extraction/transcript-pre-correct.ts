import { logger } from "@/lib/infra/logger"

const TAG = "transcript-pre-correct"

// ─── Levenshtein helpers ──────────────────────────────────────────────────

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

function splitWords(text: string): string[] {
	return text.match(/\S+/g) ?? []
}

// ─── Types ────────────────────────────────────────────────────────────────

type RawToken = {
	id: string
	page_order: number
	text_raw: string
}

export type TranscriptCorrection = {
	id: string
	textCorrected: string
}

// ─── Pre-correction ───────────────────────────────────────────────────────

const MAX_DISTANCE = 0.4
const LOOK_AHEAD = 8

/**
 * Aligns raw Cloud Vision tokens for a single page against the Gemini
 * transcript for that page using Levenshtein distance. Returns corrections
 * where the transcript word is a close fuzzy match to the raw token.
 *
 * This is a deterministic pass — no LLM call. The goal is to give the
 * downstream attribution step cleaner text to work with.
 */
function preCorrectPage(
	tokens: RawToken[],
	transcript: string,
): TranscriptCorrection[] {
	const transcriptWords = splitWords(transcript)
	if (transcriptWords.length === 0 || tokens.length === 0) return []

	const corrections: TranscriptCorrection[] = []
	let wordCursor = 0

	for (const token of tokens) {
		if (wordCursor >= transcriptWords.length) break

		const rawLower = token.text_raw.toLowerCase()
		if (rawLower.length === 0) continue

		let bestIdx = -1
		let bestDist = Number.POSITIVE_INFINITY

		const searchEnd = Math.min(
			wordCursor + LOOK_AHEAD,
			transcriptWords.length,
		)
		for (let i = wordCursor; i < searchEnd; i++) {
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
			// Only emit a correction if the text actually differs
			if (transcriptWord !== token.text_raw) {
				corrections.push({
					id: token.id,
					textCorrected: transcriptWord,
				})
			}
			wordCursor = bestIdx + 1
		}
	}

	return corrections
}

/**
 * Pre-corrects all tokens across all pages using the Gemini page transcripts.
 * Groups tokens by page, aligns each page against its transcript, and returns
 * the combined corrections.
 */
export function preCorrectFromTranscripts(
	tokens: RawToken[],
	pageTranscripts: Array<{ page: number; transcript: string }>,
): TranscriptCorrection[] {
	const transcriptByPage = new Map(
		pageTranscripts.map((p) => [p.page, p.transcript]),
	)

	const tokensByPage = new Map<number, RawToken[]>()
	for (const t of tokens) {
		const list = tokensByPage.get(t.page_order) ?? []
		list.push(t)
		tokensByPage.set(t.page_order, list)
	}

	const allCorrections: TranscriptCorrection[] = []

	for (const [pageOrder, pageTokens] of tokensByPage) {
		const transcript = transcriptByPage.get(pageOrder)
		if (!transcript) continue

		const corrections = preCorrectPage(pageTokens, transcript)
		allCorrections.push(...corrections)
	}

	if (allCorrections.length > 0) {
		logger.info(TAG, "Transcript pre-correction complete", {
			total_tokens: tokens.length,
			corrected: allCorrections.length,
			pages: tokensByPage.size,
		})
	}

	return allCorrections
}

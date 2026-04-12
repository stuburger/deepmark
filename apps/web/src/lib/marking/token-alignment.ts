import { resolveSignal } from "./mark-registry"
import type { MarkSignal, PageToken, StudentPaperAnnotation } from "./types"

// ─── Types ──────────────────────────────────────────────────────────────────

/** Per-token alignment to character positions in student_answer */
export type TokenAlignment = {
	tokenMap: Record<string, { start: number; end: number }>
	confidence: number
}

/** All annotation signal names — the 6 physical mark signals plus ao_tag and chain. */
export type AnnotationSignal = MarkSignal | "ao_tag" | "chain"

/** PM-style mark: typed decoration over a character range */
export type TextMark = {
	from: number
	to: number
	type: AnnotationSignal
	sentiment: "positive" | "negative" | "neutral"
	attrs: Record<string, unknown>
	annotationId: string
}

/** Text split at mark boundaries — for span rendering */
export type TextSegment = {
	text: string
	marks: TextMark[]
}

// ─── String utilities ───────────────────────────────────────────────────────

export type WordWithOffset = { word: string; start: number; end: number }

/** Split text on whitespace, tracking original character positions. */
export function splitWithOffsets(text: string): WordWithOffset[] {
	const result: WordWithOffset[] = []
	const regex = /\S+/g
	for (let match = regex.exec(text); match !== null; match = regex.exec(text)) {
		result.push({
			word: match[0],
			start: match.index,
			end: match.index + match[0].length,
		})
	}
	return result
}

/** Classic Levenshtein distance between two strings. */
export function levenshtein(a: string, b: string): number {
	const m = a.length
	const n = b.length
	if (m === 0) return n
	if (n === 0) return m

	// Single-row DP
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

/** Normalised edit distance (0–1). 0 = identical, 1 = completely different. */
export function normalizedDistance(a: string, b: string): number {
	const maxLen = Math.max(a.length, b.length)
	if (maxLen === 0) return 0
	return levenshtein(a, b) / maxLen
}

// ─── Token-to-answer alignment ──────────────────────────────────────────────

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

// ─── Mark derivation ────────────────────────────────────────────────────────

function resolveMarkType(
	annotation: StudentPaperAnnotation,
): AnnotationSignal | null {
	return resolveSignal(
		annotation.overlay_type,
		annotation.payload as Record<string, unknown>,
	)
}

/**
 * Derives PM-style TextMarks from annotations using the token alignment map.
 * Skips annotations without valid anchor tokens or failed alignment lookups.
 */
export function deriveTextMarks(
	annotations: StudentPaperAnnotation[],
	alignment: TokenAlignment,
): TextMark[] {
	const marks: TextMark[] = []

	for (const a of annotations) {
		if (!a.anchor_token_start_id || !a.anchor_token_end_id) continue

		const startOffset = alignment.tokenMap[a.anchor_token_start_id]
		const endOffset = alignment.tokenMap[a.anchor_token_end_id]
		if (!startOffset || !endOffset) continue

		const from = startOffset.start
		const to = endOffset.end
		if (from >= to) continue

		const type = resolveMarkType(a)
		if (!type) continue

		const sentiment = (a.sentiment ?? "neutral") as TextMark["sentiment"]

		// Extract relevant attrs from payload
		const payload = a.payload as Record<string, unknown>
		const attrs: Record<string, unknown> = {}
		if (payload.reason) attrs.reason = payload.reason
		if (payload.label) attrs.label = payload.label
		if (payload.text) attrs.text = payload.text
		if (payload.category) attrs.category = payload.category
		if (payload.display) attrs.display = payload.display
		if (payload.awarded !== undefined) attrs.awarded = payload.awarded
		if (payload.quality) attrs.quality = payload.quality
		if (payload.chainType) attrs.chainType = payload.chainType
		if (payload.phrase) attrs.phrase = payload.phrase

		marks.push({ from, to, type, sentiment, attrs, annotationId: a.id })
	}

	return marks.sort((a, b) => a.from - b.from)
}

// ─── Segment splitting ──────────────────────────────────────────────────────

/**
 * Splits text into segments at mark boundaries (interval-splitting algorithm).
 * Each segment carries the list of marks covering it.
 */
export function splitIntoSegments(
	text: string,
	marks: TextMark[],
): TextSegment[] {
	if (text.length === 0) return []
	if (marks.length === 0) return [{ text, marks: [] }]

	// Collect unique boundary points
	const boundaries = new Set<number>()
	boundaries.add(0)
	boundaries.add(text.length)
	for (const m of marks) {
		if (m.from >= 0 && m.from <= text.length) boundaries.add(m.from)
		if (m.to >= 0 && m.to <= text.length) boundaries.add(m.to)
	}

	const sorted = [...boundaries].sort((a, b) => a - b)
	const segments: TextSegment[] = []

	for (let i = 0; i < sorted.length - 1; i++) {
		const start = sorted[i]
		const end = sorted[i + 1]
		if (start === end) continue

		const segmentText = text.slice(start, end)
		const coveringMarks = marks.filter((m) => m.from < end && m.to > start)

		segments.push({ text: segmentText, marks: coveringMarks })
	}

	return segments
}

// ─── Reverse alignment (char range → tokens) ───────────────────────────────

export type ResolvedTokenSpan = {
	startTokenId: string
	endTokenId: string
	/** All token IDs in the span */
	tokenIds: string[]
	/** [yMin, xMin, yMax, xMax] normalised 0–1000, hull of all matched tokens */
	bbox: [number, number, number, number]
	pageOrder: number
}

/**
 * Reverse-maps a character range in student_answer back to OCR tokens.
 * Returns the first and last matching tokens, all token IDs in the span,
 * and a bounding box hull.
 *
 * Returns null if no tokens overlap the range.
 */
export function charRangeToTokens(
	from: number,
	to: number,
	alignment: TokenAlignment,
	tokens: PageToken[],
): ResolvedTokenSpan | null {
	// Find all tokens whose aligned char range overlaps [from, to)
	const matched: PageToken[] = []

	for (const token of tokens) {
		const offset = alignment.tokenMap[token.id]
		if (!offset) continue
		// Overlap: token.start < to AND token.end > from
		if (offset.start < to && offset.end > from) {
			matched.push(token)
		}
	}

	if (matched.length === 0) return null

	// Compute bbox hull
	let yMin = Number.POSITIVE_INFINITY
	let xMin = Number.POSITIVE_INFINITY
	let yMax = Number.NEGATIVE_INFINITY
	let xMax = Number.NEGATIVE_INFINITY

	for (const t of matched) {
		const [tYMin, tXMin, tYMax, tXMax] = t.bbox
		if (tYMin < yMin) yMin = tYMin
		if (tXMin < xMin) xMin = tXMin
		if (tYMax > yMax) yMax = tYMax
		if (tXMax > xMax) xMax = tXMax
	}

	return {
		startTokenId: matched[0].id,
		endTokenId: matched[matched.length - 1].id,
		tokenIds: matched.map((t) => t.id),
		bbox: [yMin, xMin, yMax, xMax],
		pageOrder: matched[0].page_order,
	}
}

import type { PageToken, TokenAlignment } from "@mcp-gcse/shared"

/**
 * Build a presentation-friendly view of the student's CLEAN answer text for
 * the annotation LLM. Each word in the clean text is paired with the
 * underlying OCR token's ID via the existing alignment map. Words inside
 * `[crossed out: ...]` blocks are excluded entirely — the LLM literally
 * cannot pick them because their tokens never appear in the labelled list.
 *
 * The LLM picks a `start` and `end` token via SHORT ALIASES ("t1", "t2", …)
 * rather than raw cuids. Aliases keep the prompt readable and the LLM's
 * output low-entropy. The dispatch resolver maps alias → real token ID via
 * `aliasToTokenId`, then uses the existing alignment to get char positions
 * for the ProseMirror mark.
 *
 * Why this works (and the OCR-token-numbered-array approach didn't):
 *   - The LLM sees clean prose (correctly spelled where the answer is clean,
 *     misspelled where the student misspelled — never OCR-garbled).
 *   - Crossed-out drafts disappear from the LLM's view, so it can't be
 *     biased into ducking by their presence.
 *   - The anchoring unit is still a token (matches ProseMirror's word-level
 *     positioning via existing ocrToken marks), but the LLM identifies it by
 *     proximity to readable context rather than navigating an array of
 *     noisy strings.
 */

export type LabeledWord = {
	/** Short alias shown to the LLM, e.g. "t1". 1-based sequence. */
	alias: string
	/** Underlying token ID (cuid). */
	tokenId: string
	/** The word as it appears in `student_answer` (clean text). */
	word: string
	/** Character offset in `student_answer` (inclusive). */
	charStart: number
	/** Character offset in `student_answer` (exclusive). */
	charEnd: number
}

export type LabelResult = {
	labeled: LabeledWord[]
	aliasToTokenId: Map<string, string>
	tokenIdToAlias: Map<string, string>
}

const CROSSED_OUT_RE = /\[crossed out:\s*([\s\S]*?)\]/g

/**
 * Returns inclusive char ranges of `[crossed out: ...]` blocks in
 * `studentAnswer`. The block markers themselves are included in the range
 * (so tokens aligned to the literal "[" or "out:" tokens are also excluded).
 */
function findCrossedOutRanges(
	studentAnswer: string,
): Array<{ start: number; end: number }> {
	const ranges: Array<{ start: number; end: number }> = []
	CROSSED_OUT_RE.lastIndex = 0
	for (const m of studentAnswer.matchAll(CROSSED_OUT_RE)) {
		const start = m.index ?? 0
		ranges.push({ start, end: start + m[0].length })
	}
	return ranges
}

function isCharInsideCrossedOut(
	charPos: number,
	ranges: ReadonlyArray<{ start: number; end: number }>,
): boolean {
	for (const r of ranges) {
		if (charPos >= r.start && charPos < r.end) return true
	}
	return false
}

/**
 * Build the labeled-words list and the alias↔tokenId maps.
 *
 * Iteration order is char-position in `student_answer`, so the labelled
 * list reads left-to-right as the student wrote it. Tokens not aligned to
 * any char position (alignment failures) are skipped — they can't be
 * meaningfully anchored anyway.
 */
export function labelCleanWords(
	studentAnswer: string,
	tokens: ReadonlyArray<PageToken>,
	alignment: TokenAlignment,
): LabelResult {
	const crossedOutRanges = findCrossedOutRanges(studentAnswer)

	// Pair each token with its char offset (when aligned). Drop tokens that
	// fall inside crossed-out blocks — the LLM doesn't see them.
	type Candidate = {
		tokenId: string
		charStart: number
		charEnd: number
	}
	const candidates: Candidate[] = []
	for (const token of tokens) {
		const offset = alignment.tokenMap[token.id]
		if (!offset) continue
		if (isCharInsideCrossedOut(offset.start, crossedOutRanges)) continue
		candidates.push({
			tokenId: token.id,
			charStart: offset.start,
			charEnd: offset.end,
		})
	}

	candidates.sort((a, b) => a.charStart - b.charStart)

	const labeled: LabeledWord[] = []
	const aliasToTokenId = new Map<string, string>()
	const tokenIdToAlias = new Map<string, string>()
	for (let i = 0; i < candidates.length; i++) {
		const c = candidates[i]
		if (!c) continue
		const alias = `t${i + 1}`
		const word = studentAnswer.slice(c.charStart, c.charEnd)
		labeled.push({
			alias,
			tokenId: c.tokenId,
			word,
			charStart: c.charStart,
			charEnd: c.charEnd,
		})
		aliasToTokenId.set(alias, c.tokenId)
		tokenIdToAlias.set(c.tokenId, alias)
	}

	return { labeled, aliasToTokenId, tokenIdToAlias }
}

/**
 * Render the labeled-words list for inclusion in the annotation prompt.
 * Format: `[t1]In [t2]the [t3]beggining [t4]of …`
 *
 * Clean text only — anything inside `[crossed out: ...]` blocks was
 * excluded at the labelling step.
 */
export function renderLabeledWords(
	labeled: ReadonlyArray<LabeledWord>,
): string {
	return labeled.map((w) => `[${w.alias}]${w.word}`).join(" ")
}

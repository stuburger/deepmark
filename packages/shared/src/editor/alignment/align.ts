import type { PageToken } from "../types"
import type { TokenAlignment } from "./types"

/**
 * Build a `TokenAlignment` from the per-token char offsets that were
 * recorded at extraction time and persisted on
 * `student_paper_page_tokens.answer_char_start/end`.
 *
 * Pure function, synchronous, deterministic. No text matching of any
 * kind. The mapping was already produced by the extract Lambda's
 * `mapTokensToChars` step — this is just a reshape from
 * `PageToken[]` → `tokenId → { start, end }` map for consumers.
 *
 * NO FUZZY MATCHING. NO LEVENSHTEIN. NO IN-MEMORY ALIGNMENT.
 * See CLAUDE.md "Token↔text mapping is the extract LLM's job".
 *
 * Tokens with null `answer_char_start` / `answer_char_end` are skipped
 * — they're page artifacts, stray marks, or unrecoverable OCR fragments
 * that the extract LLM decided don't correspond to any answer word.
 */
export function tokenAlignmentFromOffsets(
	tokens: ReadonlyArray<PageToken>,
): TokenAlignment {
	if (tokens.length === 0) return { tokenMap: {}, confidence: 0 }

	const tokenMap: Record<string, { start: number; end: number }> = {}
	let mappedCount = 0

	for (const t of tokens) {
		if (t.answer_char_start === null || t.answer_char_end === null) continue
		tokenMap[t.id] = { start: t.answer_char_start, end: t.answer_char_end }
		mappedCount++
	}

	return { tokenMap, confidence: mappedCount / tokens.length }
}

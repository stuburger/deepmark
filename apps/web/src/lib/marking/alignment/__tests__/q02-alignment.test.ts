import { sortTokensSpatially } from "@mcp-gcse/shared"
import { describe, expect, it } from "vitest"
import type { PageToken } from "../../types"
import { alignTokensToAnswer } from "../align"
import { normalizedDistance } from "../string-utils"
import {
	Q02_ANSWER_TEXT,
	Q02_TOKENS_PARA_ORDER,
} from "./fixtures/q02-subhaan-baig"

/**
 * Regression test for the bbox mis-attribution discovered on production
 * submission `cmo67pmym000002juduby8kc3` (Subhaan Baig, Q02).
 *
 * When the client fetched tokens in Cloud Vision's `(para, line, word)`
 * order, `alignTokensToAnswer`'s greedy advancing-cursor walk skipped tokens
 * whose corresponding answer-text word lay behind the cursor, and Pass 2's
 * positional fill then mapped those tokens to unrelated free answer words
 * elsewhere in the document — putting bboxes on physically wrong scan words.
 *
 * The fix: tokens must be spatially sorted (same order the attribution LLM
 * used when authoring `answer_text`) before alignment. This test pins that
 * contract: for every mapped token, the char range it was assigned must
 * contain text that fuzzy-matches the token's own corrected value.
 */

function inflate(
	t: Pick<
		PageToken,
		"id" | "page_order" | "text_raw" | "text_corrected" | "bbox"
	>,
): PageToken {
	return {
		...t,
		para_index: 0,
		line_index: 0,
		word_index: 0,
		confidence: null,
		question_id: null,
		answer_char_start: null,
		answer_char_end: null,
	}
}

function spatiallySorted(tokens: PageToken[]): PageToken[] {
	const byPage = new Map<number, PageToken[]>()
	for (const t of tokens) {
		const list = byPage.get(t.page_order) ?? []
		list.push(t)
		byPage.set(t.page_order, list)
	}
	return Array.from(byPage.keys())
		.sort((a, b) => a - b)
		.flatMap((page) => sortTokensSpatially(byPage.get(page) ?? []))
}

/**
 * Invariant for LLM-corrected tokens: when the attribution LLM emitted a
 * `text_corrected` value, it is authoritatively claiming "the student wrote
 * X at this bbox". Alignment must then map that bbox to char range of X (or
 * a fuzzy-near neighbour) in the answer_text. A violation means alignment
 * anchored the token to a physically wrong word — the production failure.
 *
 * Tokens without a correction are excluded: those are either Vision got-it-
 * right words (no correction needed) or wildly garbled junk the LLM chose
 * not to fix, and Pass 2 positional fill is expected to roam for those.
 */
function correctedBboxViolations(
	tokens: PageToken[],
	tokenMap: Record<string, { start: number; end: number }>,
	answer: string,
): string[] {
	const violations: string[] = []
	for (const t of tokens) {
		if (!t.text_corrected) continue
		const range = tokenMap[t.id]
		if (!range) continue
		const expected = t.text_corrected.toLowerCase()
		if (expected.length <= 1) continue
		const mapped = answer.slice(range.start, range.end).toLowerCase()
		const d = normalizedDistance(mapped, expected)
		if (d > 0.4) {
			violations.push(
				`${t.id}: expected "${expected}" but bbox points to "${mapped}" (d=${d.toFixed(2)})`,
			)
		}
	}
	return violations
}

describe("Q02 alignment — Subhaan Baig regression", () => {
	const tokens = Q02_TOKENS_PARA_ORDER.map(inflate)

	it("spatially-sorted tokens align cleanly to answer_text", () => {
		const sorted = spatiallySorted(tokens)
		const result = alignTokensToAnswer(Q02_ANSWER_TEXT, sorted)

		expect(result.confidence).toBeGreaterThan(0.7)

		const violations = correctedBboxViolations(
			sorted,
			result.tokenMap,
			Q02_ANSWER_TEXT,
		)
		expect(
			violations,
			`Aligned bboxes must land on the right answer words:\n${violations.slice(0, 10).join("\n")}`,
		).toEqual([])
	})

	it("para-order tokens reproduce the production failure (safety net)", () => {
		const result = alignTokensToAnswer(Q02_ANSWER_TEXT, tokens)

		const violations = correctedBboxViolations(
			tokens,
			result.tokenMap,
			Q02_ANSWER_TEXT,
		)

		// Documents the bug: para-order alignment anchors several LLM-corrected
		// tokens to the wrong answer words. If this ever drops below the
		// threshold, the alignment algorithm changed and the spatial-sort
		// dependency may have shifted — re-evaluate whether this test is still
		// guarding the right thing.
		expect(violations.length).toBeGreaterThan(5)
	})
})

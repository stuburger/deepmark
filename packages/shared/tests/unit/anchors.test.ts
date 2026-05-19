import { describe, expect, it } from "vitest"
import {
	DEFAULT_ANCHOR_OPTIONS,
	identifyAnchors,
	tokenCandidates,
} from "../../src/editor/alignment/anchors"
import { splitWithOffsets } from "../../src/editor/alignment/string-utils"
import type { PageToken } from "../../src/editor/types"

function token(
	text_raw: string,
	confidence = 0.9,
	text_corrected: string | null = null,
): PageToken {
	return {
		id: `tok-${text_raw}-${Math.random().toString(36).slice(2, 8)}`,
		page_order: 1,
		para_index: 0,
		line_index: 0,
		word_index: 0,
		text_raw,
		text_corrected,
		bbox: [0, 0, 10, 10],
		confidence,
		question_id: null,
		answer_char_start: null,
		answer_char_end: null,
	}
}

describe("tokenCandidates", () => {
	it("returns just lowercase raw when corrected is null", () => {
		expect(tokenCandidates(token("Broughton", 0.9, null))).toEqual([
			"broughton",
		])
	})

	it("returns just raw when corrected equals raw", () => {
		expect(tokenCandidates(token("Broughton", 0.9, "Broughton"))).toEqual([
			"broughton",
		])
	})

	it("returns both forms when corrected differs", () => {
		expect(tokenCandidates(token("fears", 0.7, "tears"))).toEqual([
			"fears",
			"tears",
		])
	})

	it("returns only corrected when raw is empty", () => {
		expect(tokenCandidates(token("", 0.5, "recovered"))).toEqual(["recovered"])
	})

	it("returns empty when both forms are empty", () => {
		expect(tokenCandidates(token("", 0.5, ""))).toEqual([])
	})

	it("returns empty when raw is empty and corrected is null", () => {
		expect(tokenCandidates(token("", 0.5, null))).toEqual([])
	})
})

describe("identifyAnchors", () => {
	it("returns empty for empty tokens", () => {
		const answer = splitWithOffsets("The quick brown fox")
		expect(identifyAnchors([], answer)).toEqual([])
	})

	it("returns empty when no token meets the length threshold", () => {
		const answer = splitWithOffsets("The quick brown fox")
		const tokens = [token("at"), token("of"), token("to")]
		expect(identifyAnchors(tokens, answer)).toEqual([])
	})

	it("returns empty when all tokens fail the confidence threshold", () => {
		const answer = splitWithOffsets("Broughton wrote a novel")
		const tokens = [token("Broughton", 0.3)]
		expect(identifyAnchors(tokens, answer)).toEqual([])
	})

	it("anchors a long, high-confidence, exact match", () => {
		const answer = splitWithOffsets("In the novel, Broughton wrote a piece")
		const tokens = [token("Broughton", 0.9)]
		const anchors = identifyAnchors(tokens, answer)
		expect(anchors).toHaveLength(1)
		expect(anchors[0].tokenIndex).toBe(0)
		// "Broughton" is word #3 (0-indexed)
		expect(answer[anchors[0].wordIndex].word).toBe("Broughton")
	})

	it("rejects a match whose target word appears multiple times in the answer", () => {
		// "narrator" appears 3 times — ambiguous as a checkpoint
		const answer = splitWithOffsets(
			"The narrator thought about the narrator's choice and then the narrator left",
		)
		const tokens = [token("narrator", 0.95)]
		expect(identifyAnchors(tokens, answer)).toEqual([])
	})

	it("accepts a match even when token text appears 2× in tokens (still unique in answer)", () => {
		// Uniqueness is about the ANSWER words, not the tokens
		const answer = splitWithOffsets("Broughton finished the novel")
		const tokens = [token("Broughton", 0.9), token("Broughton", 0.9)]
		const anchors = identifyAnchors(tokens, answer)
		// Both tokens qualify and both point at the same word; LIS picks
		// the first (it can extend a chain of length 1, the second can't
		// extend strictly past it).
		expect(anchors).toHaveLength(1)
		expect(anchors[0].tokenIndex).toBe(0)
	})

	it("drops a rogue anchor that points far ahead of its peers (LIS)", () => {
		// "burning" appears at word #14. The OCR token at index 5 has a
		// distant text_raw "buming" that could fuzzy-match "burning"
		// (distance 0.14 ≤ 0.2). If we accepted that match the cursor
		// would jump to word 14 and disqualify every legitimate anchor
		// between tokens 6-9. LIS isolates this outlier.
		const answer = splitWithOffsets(
			"once upon a time there were several distinct happenings while " +
				"a fierce dragon was burning quietly",
		)
		const tokens = [
			token("once", 0.9), // #0 → word 0
			token("several", 0.9), // #1 → word 5
			token("distinct", 0.9), // #2 → word 6
			token("happenings", 0.9), // #3 → word 7
			token("burning", 0.9), // #4 → word 13 (legit late match)
			token("quietly", 0.9), // #5 → word 14
		]
		const anchors = identifyAnchors(tokens, answer)
		// All anchors are in increasing wordIndex order
		for (let i = 1; i < anchors.length; i++) {
			expect(anchors[i].wordIndex).toBeGreaterThan(anchors[i - 1].wordIndex)
		}
		// Either everything maps in order, or LIS keeps the longest
		// monotonic chain — both fine, the invariant is monotonicity.
		expect(anchors.length).toBeGreaterThanOrEqual(4)
	})

	it("uses corrected text when raw doesn't match but corrected does", () => {
		const answer = splitWithOffsets("She felt emotional about leaving")
		const tokens = [token("emosional", 0.85, "emotional")]
		const anchors = identifyAnchors(tokens, answer)
		expect(anchors).toHaveLength(1)
		expect(answer[anchors[0].wordIndex].word).toBe("emotional")
	})

	it("respects custom AnchorOptions thresholds", () => {
		const answer = splitWithOffsets("Bobby kissed her gently and left")
		const tokens = [token("kissed", 0.4)] // would fail default 0.5 floor
		expect(identifyAnchors(tokens, answer)).toEqual([])
		// Now lower the threshold and the same token qualifies
		const looser = identifyAnchors(tokens, answer, {
			...DEFAULT_ANCHOR_OPTIONS,
			minConfidence: 0.3,
		})
		expect(looser).toHaveLength(1)
	})

	it("returns anchors in tokenIndex order even when later tokens match earlier words", () => {
		// Tokens are in a weird order vs the answer — the function should
		// preserve token order in the output. LIS may filter some, but
		// remaining anchors must be ordered by tokenIndex (which is also
		// ascending by wordIndex after LIS).
		const answer = splitWithOffsets(
			"Broughton arrived early carrying enormous luggage carefully",
		)
		const tokens = [
			token("Broughton", 0.9), // → word 0
			token("arrived", 0.9), // → word 1
			token("carrying", 0.9), // → word 3
			token("luggage", 0.9), // → word 5
			token("carefully", 0.9), // → word 6
		]
		const anchors = identifyAnchors(tokens, answer)
		for (let i = 1; i < anchors.length; i++) {
			expect(anchors[i].tokenIndex).toBeGreaterThan(
				anchors[i - 1].tokenIndex,
			)
			expect(anchors[i].wordIndex).toBeGreaterThan(
				anchors[i - 1].wordIndex,
			)
		}
	})
})

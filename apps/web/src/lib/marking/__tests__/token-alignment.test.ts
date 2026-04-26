import {
	type TextMark,
	type TokenAlignment,
	alignTokensToAnswer,
	deriveTextMarks,
	levenshtein,
	normalizedDistance,
	splitWithOffsets,
} from "@mcp-gcse/shared"
import { describe, expect, it } from "vitest"
import { charRangeToTokens } from "../alignment/reverse"
import { splitIntoSegments } from "../alignment/segments"
import type { PageToken, StudentPaperAnnotation } from "../types"

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeToken(
	id: string,
	textRaw: string,
	opts?: { textCorrected?: string; questionId?: string },
): PageToken {
	return {
		id,
		page_order: 1,
		para_index: 0,
		line_index: 0,
		word_index: 0,
		text_raw: textRaw,
		text_corrected: opts?.textCorrected ?? null,
		bbox: [0, 0, 100, 100],
		confidence: 0.9,
		question_id: opts?.questionId ?? "q1",
		answer_char_start: null,
		answer_char_end: null,
	}
}

function makeAnnotation(
	id: string,
	startTokenId: string | null,
	endTokenId: string | null,
	overlayType: string,
	payload: Record<string, unknown> = {},
): StudentPaperAnnotation {
	return {
		id,
		grading_run_id: "run1",
		question_id: "q1",
		page_order: 1,
		overlay_type: overlayType,
		sentiment: "positive",
		payload: { _v: 1, ...payload },
		bbox: [0, 0, 100, 100],
		anchor_token_start_id: startTokenId,
		anchor_token_end_id: endTokenId,
	} as StudentPaperAnnotation
}

// ─── splitWithOffsets ───────────────────────────────────────────────────────

describe("splitWithOffsets", () => {
	it("splits simple words with correct offsets", () => {
		expect(splitWithOffsets("hello world")).toEqual([
			{ word: "hello", start: 0, end: 5 },
			{ word: "world", start: 6, end: 11 },
		])
	})

	it("handles multiple spaces", () => {
		const result = splitWithOffsets("hello  world")
		expect(result).toEqual([
			{ word: "hello", start: 0, end: 5 },
			{ word: "world", start: 7, end: 12 },
		])
	})

	it("handles leading and trailing whitespace", () => {
		const result = splitWithOffsets("  hello  ")
		expect(result).toEqual([{ word: "hello", start: 2, end: 7 }])
	})

	it("handles newlines", () => {
		const result = splitWithOffsets("line one\nline two")
		expect(result).toEqual([
			{ word: "line", start: 0, end: 4 },
			{ word: "one", start: 5, end: 8 },
			{ word: "line", start: 9, end: 13 },
			{ word: "two", start: 14, end: 17 },
		])
	})

	it("returns empty array for empty string", () => {
		expect(splitWithOffsets("")).toEqual([])
	})

	it("returns empty array for whitespace-only string", () => {
		expect(splitWithOffsets("   ")).toEqual([])
	})

	it("handles a single word", () => {
		expect(splitWithOffsets("osmosis")).toEqual([
			{ word: "osmosis", start: 0, end: 7 },
		])
	})
})

// ─── levenshtein ────────────────────────────────────────────────────────────

describe("levenshtein", () => {
	it("returns 0 for identical strings", () => {
		expect(levenshtein("osmosis", "osmosis")).toBe(0)
	})

	it("handles one substitution", () => {
		expect(levenshtein("osmosls", "osmosis")).toBe(1)
	})

	it("handles one deletion", () => {
		expect(levenshtein("osmsis", "osmosis")).toBe(1)
	})

	it("handles one insertion", () => {
		expect(levenshtein("osmoosis", "osmosis")).toBe(1)
	})

	it("handles completely different strings", () => {
		expect(levenshtein("abc", "xyz")).toBe(3)
	})

	it("handles empty vs non-empty", () => {
		expect(levenshtein("", "abc")).toBe(3)
		expect(levenshtein("abc", "")).toBe(3)
	})

	it("handles both empty", () => {
		expect(levenshtein("", "")).toBe(0)
	})

	it("is case-sensitive", () => {
		expect(levenshtein("ABC", "abc")).toBe(3)
	})
})

// ─── normalizedDistance ─────────────────────────────────────────────────────

describe("normalizedDistance", () => {
	it("returns 0 for identical strings", () => {
		expect(normalizedDistance("osmosis", "osmosis")).toBe(0)
	})

	it("returns ~0.14 for one char off in 7-char word", () => {
		const d = normalizedDistance("osmosls", "osmosis")
		expect(d).toBeCloseTo(1 / 7, 2)
	})

	it("returns 1 for completely different same-length strings", () => {
		expect(normalizedDistance("abc", "xyz")).toBe(1)
	})

	it("returns 0 for two empty strings", () => {
		expect(normalizedDistance("", "")).toBe(0)
	})

	it("handles different lengths", () => {
		// "ab" vs "abcd": distance 2, max length 4
		expect(normalizedDistance("ab", "abcd")).toBe(0.5)
	})
})

// ─── alignTokensToAnswer ───────────────────────────────────────────────────

describe("alignTokensToAnswer", () => {
	it("aligns perfectly matching tokens", () => {
		const tokens = [
			makeToken("t1", "The"),
			makeToken("t2", "cell"),
			makeToken("t3", "membrane"),
		]
		const result = alignTokensToAnswer("The cell membrane", tokens)

		expect(result.confidence).toBe(1)
		expect(result.tokenMap.t1).toEqual({ start: 0, end: 3 })
		expect(result.tokenMap.t2).toEqual({ start: 4, end: 8 })
		expect(result.tokenMap.t3).toEqual({ start: 9, end: 17 })
	})

	it("aligns OCR error within threshold", () => {
		// "osmosls" vs "osmosis": distance 1/7 ≈ 0.14 < 0.4
		const tokens = [makeToken("t1", "osmosls")]
		const result = alignTokensToAnswer("osmosis", tokens)

		expect(result.confidence).toBe(1)
		expect(result.tokenMap.t1).toEqual({ start: 0, end: 7 })
	})

	it("skips OCR error beyond threshold", () => {
		// "xyzabc" vs "osmosis": completely different
		const tokens = [makeToken("t1", "xyzabc")]
		const result = alignTokensToAnswer("osmosis", tokens)

		expect(result.confidence).toBe(0)
		expect(result.tokenMap).toEqual({})
	})

	it("fuzzy matches good tokens and positionally assigns junk", () => {
		const tokens = [
			makeToken("t1", "The"),
			makeToken("t2", "GARBAGE"),
			makeToken("t3", "membrane"),
		]
		const result = alignTokensToAnswer("The cell membrane", tokens)

		// 2/3 fuzzy matched
		expect(result.confidence).toBeCloseTo(2 / 3, 2)
		expect(result.tokenMap.t1).toEqual({ start: 0, end: 3 })
		expect(result.tokenMap.t3).toEqual({ start: 9, end: 17 })
		// t2 positionally assigned to the remaining word "cell"
		expect(result.tokenMap.t2).toEqual({ start: 4, end: 8 })
	})

	it("handles extra answer word (Gemini added content)", () => {
		// Tokens don't include "The" but answer does
		const tokens = [makeToken("t1", "cell"), makeToken("t2", "membrane")]
		const result = alignTokensToAnswer("The cell membrane", tokens)

		expect(result.confidence).toBe(1)
		expect(result.tokenMap.t1).toEqual({ start: 4, end: 8 })
		expect(result.tokenMap.t2).toEqual({ start: 9, end: 17 })
	})

	it("handles repeated words with sequential matching", () => {
		const tokens = [
			makeToken("t1", "the"),
			makeToken("t2", "cell"),
			makeToken("t3", "the"),
			makeToken("t4", "wall"),
		]
		const result = alignTokensToAnswer("the cell the wall", tokens)

		expect(result.confidence).toBe(1)
		expect(result.tokenMap.t1).toEqual({ start: 0, end: 3 })
		expect(result.tokenMap.t2).toEqual({ start: 4, end: 8 })
		expect(result.tokenMap.t3).toEqual({ start: 9, end: 12 })
		expect(result.tokenMap.t4).toEqual({ start: 13, end: 17 })
	})

	it("returns empty map for empty answer", () => {
		const tokens = [makeToken("t1", "hello")]
		const result = alignTokensToAnswer("", tokens)
		expect(result.tokenMap).toEqual({})
		expect(result.confidence).toBe(0)
	})

	it("returns empty map for empty tokens", () => {
		const result = alignTokensToAnswer("hello world", [])
		expect(result.tokenMap).toEqual({})
		expect(result.confidence).toBe(0)
	})

	it("maps all tokens — fuzzy match + positional fill for junk", () => {
		// 3 tokens: t2 fuzzy-matches "cell", t1 + t3 get positionally assigned
		const tokens = [
			makeToken("t1", "zzz"),
			makeToken("t2", "cell"),
			makeToken("t3", "yyy"),
		]
		const result = alignTokensToAnswer("The cell membrane", tokens)

		// Only t2 matched via fuzzy → confidence = 1/3
		expect(result.confidence).toBeCloseTo(1 / 3, 2)
		// t2 fuzzy matched to "cell"
		expect(result.tokenMap.t2).toEqual({ start: 4, end: 8 })
		// t1 and t3 positionally assigned to remaining words "The" and "membrane"
		expect(result.tokenMap.t1).toEqual({ start: 0, end: 3 })
		expect(result.tokenMap.t3).toEqual({ start: 9, end: 17 })
	})

	it("prefers text_corrected over text_raw", () => {
		const tokens = [
			makeToken("t1", "cel1", { textCorrected: "cell" }),
			makeToken("t2", "membran3", { textCorrected: "membrane" }),
		]
		const result = alignTokensToAnswer("cell membrane", tokens)

		expect(result.confidence).toBe(1)
		expect(result.tokenMap.t1).toEqual({ start: 0, end: 4 })
		expect(result.tokenMap.t2).toEqual({ start: 5, end: 13 })
	})

	it("is case-insensitive", () => {
		const tokens = [makeToken("t1", "THE"), makeToken("t2", "CELL")]
		const result = alignTokensToAnswer("the cell", tokens)

		expect(result.confidence).toBe(1)
		expect(result.tokenMap.t1).toEqual({ start: 0, end: 3 })
	})
})

// ─── deriveTextMarks ────────────────────────────────────────────────────────

describe("deriveTextMarks", () => {
	const alignment = {
		tokenMap: {
			t1: { start: 0, end: 3 },
			t2: { start: 4, end: 8 },
			t3: { start: 9, end: 17 },
		},
		confidence: 1,
	}

	it("derives a tick mark", () => {
		const annotations = [
			makeAnnotation("a1", "t1", "t2", "annotation", { signal: "tick" }),
		]
		const marks = deriveTextMarks(annotations, alignment)

		expect(marks).toHaveLength(1)
		expect(marks[0].type).toBe("tick")
		expect(marks[0].from).toBe(0)
		expect(marks[0].to).toBe(8)
		expect(marks[0].annotationId).toBe("a1")
	})

	it("skips annotations without anchor tokens", () => {
		const annotations = [makeAnnotation("a1", null, null, "annotation")]
		const marks = deriveTextMarks(annotations, alignment)
		expect(marks).toHaveLength(0)
	})

	it("skips annotations with missing start token in alignment", () => {
		const annotations = [
			makeAnnotation("a1", "missing", "t2", "annotation", { signal: "tick" }),
		]
		const marks = deriveTextMarks(annotations, alignment)
		expect(marks).toHaveLength(0)
	})

	it("skips annotations with missing end token in alignment", () => {
		const annotations = [
			makeAnnotation("a1", "t1", "missing", "annotation", { signal: "tick" }),
		]
		const marks = deriveTextMarks(annotations, alignment)
		expect(marks).toHaveLength(0)
	})

	it("skips annotations with unknown overlay type", () => {
		const annotations = [
			makeAnnotation("a1", "t1", "t2", "unknown_type", {
				text: "good point",
			}),
		]
		const marks = deriveTextMarks(annotations, alignment)
		expect(marks).toHaveLength(0)
	})

	it("derives multiple annotation types correctly", () => {
		const annotations = [
			makeAnnotation("a1", "t1", "t1", "annotation", { signal: "tick" }),
			makeAnnotation("a2", "t2", "t3", "annotation", { signal: "underline" }),
			makeAnnotation("a3", "t1", "t3", "chain", {
				chainType: "reasoning",
				phrase: "because",
			}),
		]
		const marks = deriveTextMarks(annotations, alignment)

		expect(marks).toHaveLength(3)
		expect(marks.map((m) => m.type)).toContain("tick")
		expect(marks.map((m) => m.type)).toContain("underline")
		expect(marks.map((m) => m.type)).toContain("chain")
	})

	it("carries AO attrs through from signal annotation payload", () => {
		const annotations = [
			makeAnnotation("a1", "t1", "t2", "annotation", {
				signal: "underline",
				reason: "good evaluation",
				ao_category: "AO2",
				ao_display: "AO2",
				ao_quality: "strong",
			}),
		]
		const marks = deriveTextMarks(annotations, alignment)

		expect(marks).toHaveLength(1)
		expect(marks[0].type).toBe("underline")
		expect(marks[0].attrs.ao_category).toBe("AO2")
		expect(marks[0].attrs.ao_display).toBe("AO2")
		expect(marks[0].attrs.reason).toBe("good evaluation")
	})
})

// ─── splitIntoSegments ──────────────────────────────────────────────────────

describe("splitIntoSegments", () => {
	it("returns single plain segment when no marks", () => {
		const segments = splitIntoSegments("hello world", [])
		expect(segments).toEqual([{ text: "hello world", marks: [] }])
	})

	it("splits around a mark covering the middle", () => {
		const mark: TextMark = {
			from: 4,
			to: 8,
			type: "underline",
			sentiment: "positive",
			attrs: {},
			annotationId: "a1",
		}
		const segments = splitIntoSegments("The cell membrane", [mark])

		expect(segments).toHaveLength(3)
		expect(segments[0]).toEqual({ text: "The ", marks: [] })
		expect(segments[1].text).toBe("cell")
		expect(segments[1].marks).toHaveLength(1)
		expect(segments[1].marks[0].type).toBe("underline")
		expect(segments[2]).toEqual({ text: " membrane", marks: [] })
	})

	it("handles overlapping marks", () => {
		const mark1: TextMark = {
			from: 0,
			to: 8,
			type: "chain",
			sentiment: "neutral",
			attrs: {},
			annotationId: "a1",
		}
		const mark2: TextMark = {
			from: 4,
			to: 17,
			type: "underline",
			sentiment: "positive",
			attrs: {},
			annotationId: "a2",
		}
		const segments = splitIntoSegments("The cell membrane", [mark1, mark2])

		// Boundaries: 0, 4, 8, 17
		expect(segments).toHaveLength(3)
		expect(segments[0].text).toBe("The ")
		expect(segments[0].marks).toHaveLength(1) // chain only
		expect(segments[1].text).toBe("cell")
		expect(segments[1].marks).toHaveLength(2) // chain + underline
		expect(segments[2].text).toBe(" membrane")
		expect(segments[2].marks).toHaveLength(1) // underline only
	})

	it("handles adjacent marks with no gap", () => {
		const mark1: TextMark = {
			from: 0,
			to: 3,
			type: "tick",
			sentiment: "positive",
			attrs: {},
			annotationId: "a1",
		}
		const mark2: TextMark = {
			from: 3,
			to: 8,
			type: "cross",
			sentiment: "negative",
			attrs: {},
			annotationId: "a2",
		}
		const segments = splitIntoSegments("The cell", [mark1, mark2])

		expect(segments).toHaveLength(2)
		expect(segments[0].text).toBe("The")
		expect(segments[0].marks[0].type).toBe("tick")
		expect(segments[1].text).toBe(" cell")
		expect(segments[1].marks[0].type).toBe("cross")
	})

	it("handles mark at start of text", () => {
		const mark: TextMark = {
			from: 0,
			to: 5,
			type: "tick",
			sentiment: "positive",
			attrs: {},
			annotationId: "a1",
		}
		const segments = splitIntoSegments("hello world", [mark])

		expect(segments).toHaveLength(2)
		expect(segments[0].text).toBe("hello")
		expect(segments[0].marks).toHaveLength(1)
		expect(segments[1].text).toBe(" world")
		expect(segments[1].marks).toHaveLength(0)
	})

	it("handles mark at end of text", () => {
		const mark: TextMark = {
			from: 6,
			to: 11,
			type: "tick",
			sentiment: "positive",
			attrs: {},
			annotationId: "a1",
		}
		const segments = splitIntoSegments("hello world", [mark])

		expect(segments).toHaveLength(2)
		expect(segments[0].text).toBe("hello ")
		expect(segments[0].marks).toHaveLength(0)
		expect(segments[1].text).toBe("world")
		expect(segments[1].marks).toHaveLength(1)
	})

	it("returns empty array for empty text", () => {
		expect(splitIntoSegments("", [])).toEqual([])
	})
})

// ─── charRangeToTokens (reverse alignment) ──────────────────────────────────

describe("charRangeToTokens", () => {
	const tokens = [
		makeToken("t1", "The"),
		makeToken("t2", "cell"),
		makeToken("t3", "membrane"),
	]
	// Simulate alignment: "The cell membrane"
	const alignment: TokenAlignment = {
		tokenMap: {
			t1: { start: 0, end: 3 },
			t2: { start: 4, end: 8 },
			t3: { start: 9, end: 17 },
		},
		confidence: 1,
	}

	it("finds a single token for an exact match", () => {
		const result = charRangeToTokens(4, 8, alignment, tokens)
		expect(result).not.toBeNull()
		expect(result?.startTokenId).toBe("t2")
		expect(result?.endTokenId).toBe("t2")
		expect(result?.tokenIds).toEqual(["t2"])
	})

	it("finds multiple tokens for a spanning range", () => {
		const result = charRangeToTokens(4, 17, alignment, tokens)
		expect(result).not.toBeNull()
		expect(result?.startTokenId).toBe("t2")
		expect(result?.endTokenId).toBe("t3")
		expect(result?.tokenIds).toEqual(["t2", "t3"])
	})

	it("finds all tokens for full-text range", () => {
		const result = charRangeToTokens(0, 17, alignment, tokens)
		expect(result).not.toBeNull()
		expect(result?.tokenIds).toEqual(["t1", "t2", "t3"])
	})

	it("finds tokens for a partial overlap", () => {
		// Range 2-10 overlaps t1 (0-3), t2 (4-8), t3 (9-17)
		const result = charRangeToTokens(2, 10, alignment, tokens)
		expect(result).not.toBeNull()
		expect(result?.tokenIds).toEqual(["t1", "t2", "t3"])
	})

	it("computes bbox hull from matched tokens", () => {
		const tokensWithBbox: PageToken[] = [
			{ ...makeToken("t1", "The"), bbox: [100, 50, 130, 150] },
			{ ...makeToken("t2", "cell"), bbox: [100, 160, 130, 250] },
			{ ...makeToken("t3", "membrane"), bbox: [100, 260, 130, 400] },
		]
		const result = charRangeToTokens(0, 17, alignment, tokensWithBbox)
		expect(result?.bbox).toEqual([100, 50, 130, 400])
	})

	it("returns null when no tokens overlap the range", () => {
		// Range 30-40 is beyond all token char offsets
		const result = charRangeToTokens(30, 40, alignment, tokens)
		expect(result).toBeNull()
	})

	it("returns null with empty alignment", () => {
		const emptyAlignment: TokenAlignment = { tokenMap: {}, confidence: 0 }
		const result = charRangeToTokens(0, 8, emptyAlignment, tokens)
		expect(result).toBeNull()
	})

	it("skips tokens not in alignment map", () => {
		const partialAlignment: TokenAlignment = {
			tokenMap: {
				t1: { start: 0, end: 3 },
				// t2 missing
				t3: { start: 9, end: 17 },
			},
			confidence: 0.67,
		}
		// Range covers all text but t2 isn't aligned
		const result = charRangeToTokens(0, 17, partialAlignment, tokens)
		expect(result?.tokenIds).toEqual(["t1", "t3"])
	})
})

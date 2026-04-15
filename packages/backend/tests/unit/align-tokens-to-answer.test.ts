import { describe, expect, it } from "vitest"
import {
	type AlignableToken,
	mapMappingsToOffsets,
	splitWithOffsets,
} from "../../src/lib/scan-extraction/align-tokens-to-answer-core"

// ─── splitWithOffsets ──────────────────────────────────────────────────────

describe("splitWithOffsets", () => {
	it("splits simple sentence into words with correct offsets", () => {
		const result = splitWithOffsets("The answer is 42")
		expect(result).toEqual([
			{ word: "The", start: 0, end: 3 },
			{ word: "answer", start: 4, end: 10 },
			{ word: "is", start: 11, end: 13 },
			{ word: "42", start: 14, end: 16 },
		])
	})

	it("handles multiple spaces between words", () => {
		const result = splitWithOffsets("hello   world")
		expect(result).toEqual([
			{ word: "hello", start: 0, end: 5 },
			{ word: "world", start: 8, end: 13 },
		])
	})

	it("handles leading and trailing whitespace", () => {
		const result = splitWithOffsets("  hello world  ")
		expect(result).toEqual([
			{ word: "hello", start: 2, end: 7 },
			{ word: "world", start: 8, end: 13 },
		])
	})

	it("handles punctuation attached to words", () => {
		const result = splitWithOffsets("Hello, world!")
		expect(result).toEqual([
			{ word: "Hello,", start: 0, end: 6 },
			{ word: "world!", start: 7, end: 13 },
		])
	})

	it("returns empty array for empty string", () => {
		expect(splitWithOffsets("")).toEqual([])
	})

	it("returns empty array for whitespace-only string", () => {
		expect(splitWithOffsets("   ")).toEqual([])
	})

	it("handles single word", () => {
		expect(splitWithOffsets("hello")).toEqual([
			{ word: "hello", start: 0, end: 5 },
		])
	})
})

// ─── mapMappingsToOffsets ──────────────────────────────────────────────────

describe("mapMappingsToOffsets", () => {
	const answerText = "The answer is 42"
	const answerWords = splitWithOffsets(answerText)

	function makeTokens(...words: string[]): AlignableToken[] {
		return words.map((w, i) => ({
			id: `token-${i}`,
			text_raw: w,
			text_corrected: null,
		}))
	}

	it("maps all tokens to sequential answer words", () => {
		const tokens = makeTokens("The", "answer", "is", "42")
		const mappings = [
			{ token_index: 0, answer_word_index: 0, text_corrected: "The" },
			{ token_index: 1, answer_word_index: 1, text_corrected: "answer" },
			{ token_index: 2, answer_word_index: 2, text_corrected: "is" },
			{ token_index: 3, answer_word_index: 3, text_corrected: "42" },
		]

		const result = mapMappingsToOffsets(mappings, tokens, answerWords)

		expect(result).toEqual([
			{ id: "token-0", charStart: 0, charEnd: 3, textCorrected: null },
			{ id: "token-1", charStart: 4, charEnd: 10, textCorrected: null },
			{ id: "token-2", charStart: 11, charEnd: 13, textCorrected: null },
			{ id: "token-3", charStart: 14, charEnd: 16, textCorrected: null },
		])
	})

	it("marks junk tokens with null offsets when answer_word_index is -1", () => {
		const tokens = makeTokens("The", "JUNK", "answer")
		const mappings = [
			{ token_index: 0, answer_word_index: 0, text_corrected: "The" },
			{ token_index: 1, answer_word_index: -1, text_corrected: "JUNK" },
			{ token_index: 2, answer_word_index: 1, text_corrected: "answer" },
		]

		const result = mapMappingsToOffsets(mappings, tokens, answerWords)

		expect(result[1]).toEqual({
			id: "token-1",
			charStart: null,
			charEnd: null,
			textCorrected: null,
		})
	})

	it("stores text_corrected when LLM correction differs from text_raw", () => {
		const tokens = makeTokens("teh", "anser")
		const mappings = [
			{ token_index: 0, answer_word_index: 0, text_corrected: "The" },
			{ token_index: 1, answer_word_index: 1, text_corrected: "answer" },
		]

		const result = mapMappingsToOffsets(mappings, tokens, answerWords)

		expect(result[0]?.textCorrected).toBe("The")
		expect(result[1]?.textCorrected).toBe("answer")
	})

	it("preserves existing text_corrected when LLM returns same as text_raw", () => {
		const tokens: AlignableToken[] = [
			{ id: "token-0", text_raw: "The", text_corrected: "existing-correction" },
		]
		const mappings = [
			{ token_index: 0, answer_word_index: 0, text_corrected: "The" },
		]

		const result = mapMappingsToOffsets(mappings, tokens, answerWords)

		// LLM said "The" which matches text_raw, so keep existing text_corrected
		expect(result[0]?.textCorrected).toBe("existing-correction")
	})

	it("maps multiple tokens to the same answer word (OCR split)", () => {
		const tokens = makeTokens("photo", "synthesis")
		const singleWordAnswer = splitWithOffsets("photosynthesis")
		const mappings = [
			{ token_index: 0, answer_word_index: 0, text_corrected: "photo" },
			{ token_index: 1, answer_word_index: 0, text_corrected: "synthesis" },
		]

		const result = mapMappingsToOffsets(mappings, tokens, singleWordAnswer)

		// Both tokens map to the same answer word's char range
		expect(result[0]?.charStart).toBe(0)
		expect(result[0]?.charEnd).toBe(14)
		expect(result[1]?.charStart).toBe(0)
		expect(result[1]?.charEnd).toBe(14)
	})

	it("ignores mappings with out-of-range token_index", () => {
		const tokens = makeTokens("hello")
		const mappings = [
			{ token_index: 5, answer_word_index: 0, text_corrected: "hello" },
		]

		// Out-of-range mapping is ignored; the token gets null offsets
		const result = mapMappingsToOffsets(mappings, tokens, answerWords)
		expect(result).toHaveLength(1)
		expect(result[0]).toEqual({
			id: "token-0",
			charStart: null,
			charEnd: null,
			textCorrected: null,
		})
	})

	it("handles answer_word_index out of bounds as junk", () => {
		const tokens = makeTokens("hello")
		const mappings = [
			{ token_index: 0, answer_word_index: 99, text_corrected: "hello" },
		]

		const result = mapMappingsToOffsets(mappings, tokens, answerWords)

		expect(result[0]).toEqual({
			id: "token-0",
			charStart: null,
			charEnd: null,
			textCorrected: null,
		})
	})
})

import type { PageToken, TokenAlignment } from "@mcp-gcse/shared"
import { describe, expect, it } from "vitest"
import {
	labelCleanWords,
	renderLabeledWords,
} from "../../src/lib/annotations/label-clean-words"

function token(id: string, text: string, page = 1): PageToken {
	return {
		id,
		page_order: page,
		para_index: 0,
		line_index: 0,
		word_index: 0,
		text_raw: text,
		text_corrected: text,
		bbox: [0, 0, 10, 100],
		confidence: 1,
		question_id: "q1",
		answer_char_start: null,
		answer_char_end: null,
	}
}

function alignment(
	pairs: Array<{ id: string; start: number; end: number }>,
): TokenAlignment {
	const tokenMap: Record<string, { start: number; end: number }> = {}
	for (const p of pairs) tokenMap[p.id] = { start: p.start, end: p.end }
	return { tokenMap, confidence: 1 }
}

describe("labelCleanWords — basic alignment", () => {
	it("produces 1-based aliases keyed to token IDs in char order", () => {
		const answer = "In the beggining of"
		const tokens = [
			token("tok_a", "In"),
			token("tok_b", "the"),
			token("tok_c", "beggining"),
			token("tok_d", "of"),
		]
		const align = alignment([
			{ id: "tok_a", start: 0, end: 2 },
			{ id: "tok_b", start: 3, end: 6 },
			{ id: "tok_c", start: 7, end: 16 },
			{ id: "tok_d", start: 17, end: 19 },
		])

		const result = labelCleanWords(answer, tokens, align)

		expect(result.labeled).toHaveLength(4)
		expect(result.labeled[0]).toMatchObject({
			alias: "t1",
			tokenId: "tok_a",
			word: "In",
		})
		expect(result.labeled[2]).toMatchObject({
			alias: "t3",
			tokenId: "tok_c",
			word: "beggining",
		})
		expect(result.aliasToTokenId.get("t3")).toBe("tok_c")
		expect(result.tokenIdToAlias.get("tok_c")).toBe("t3")
	})

	it("skips tokens with no alignment entry", () => {
		const answer = "In the beggining"
		const tokens = [
			token("tok_a", "In"),
			token("tok_garbled", "Xx"), // OCR garble, no clean-text match
			token("tok_b", "the"),
		]
		const align = alignment([
			{ id: "tok_a", start: 0, end: 2 },
			{ id: "tok_b", start: 3, end: 6 },
		])

		const result = labelCleanWords(answer, tokens, align)

		expect(result.labeled).toHaveLength(2)
		expect(result.aliasToTokenId.has("tok_garbled")).toBe(false)
	})

	it("sorts by char position even if token array is out of order", () => {
		const answer = "alpha beta gamma"
		const tokens = [
			token("g", "gamma"),
			token("a", "alpha"),
			token("b", "beta"),
		]
		const align = alignment([
			{ id: "a", start: 0, end: 5 },
			{ id: "b", start: 6, end: 10 },
			{ id: "g", start: 11, end: 16 },
		])

		const result = labelCleanWords(answer, tokens, align)

		expect(result.labeled.map((l) => l.word)).toEqual([
			"alpha",
			"beta",
			"gamma",
		])
		expect(result.labeled.map((l) => l.alias)).toEqual(["t1", "t2", "t3"])
	})
})

describe("labelCleanWords — crossed-out content", () => {
	const answer =
		"Beg notes here\n[crossed out: this was a draft attempt at the essay]\nThe clean essay starts here."

	it("excludes tokens inside [crossed out: ...] blocks from the labelled list", () => {
		const tokens = [
			token("t_beg", "Beg"),
			token("t_notes", "notes"),
			// inside the crossed-out block:
			token("t_cross_this", "this"),
			token("t_cross_was", "was"),
			token("t_cross_draft", "draft"),
			// after the crossed-out block:
			token("t_the", "The"),
			token("t_clean", "clean"),
			token("t_essay", "essay"),
		]
		// Char positions roughly mapped to where these words sit:
		const crossedOutStart = answer.indexOf("[crossed out:")
		const cleanEssayStart = answer.indexOf("The clean essay")
		const align = alignment([
			{ id: "t_beg", start: 0, end: 3 },
			{ id: "t_notes", start: 4, end: 9 },
			// These three sit INSIDE the crossed-out block — should be excluded:
			{
				id: "t_cross_this",
				start: crossedOutStart + 14,
				end: crossedOutStart + 18,
			},
			{
				id: "t_cross_was",
				start: crossedOutStart + 19,
				end: crossedOutStart + 22,
			},
			{
				id: "t_cross_draft",
				start: crossedOutStart + 23,
				end: crossedOutStart + 28,
			},
			// These sit AFTER the crossed-out block — should be included:
			{ id: "t_the", start: cleanEssayStart, end: cleanEssayStart + 3 },
			{ id: "t_clean", start: cleanEssayStart + 4, end: cleanEssayStart + 9 },
			{ id: "t_essay", start: cleanEssayStart + 10, end: cleanEssayStart + 15 },
		])

		const result = labelCleanWords(answer, tokens, align)

		const aliasedIds = result.labeled.map((l) => l.tokenId)
		expect(aliasedIds).toEqual([
			"t_beg",
			"t_notes",
			"t_the",
			"t_clean",
			"t_essay",
		])
		expect(result.aliasToTokenId.has("t_cross_this")).toBe(false)
		expect(result.aliasToTokenId.has("t_cross_was")).toBe(false)
		expect(result.aliasToTokenId.has("t_cross_draft")).toBe(false)
	})

	it("renumbers aliases sequentially after excluding crossed-out tokens", () => {
		const tokens = [
			token("t_beg", "Beg"),
			token("t_inside", "this"),
			token("t_clean", "clean"),
		]
		const crossedOutStart = answer.indexOf("[crossed out:")
		const cleanStart = answer.indexOf("clean")
		const align = alignment([
			{ id: "t_beg", start: 0, end: 3 },
			{
				id: "t_inside",
				start: crossedOutStart + 14,
				end: crossedOutStart + 18,
			},
			{ id: "t_clean", start: cleanStart, end: cleanStart + 5 },
		])

		const result = labelCleanWords(answer, tokens, align)

		expect(result.labeled).toHaveLength(2)
		expect(result.labeled[0]?.alias).toBe("t1")
		expect(result.labeled[1]?.alias).toBe("t2") // not t3 — crossed-out excluded entirely
	})
})

describe("renderLabeledWords", () => {
	it("renders [alias]word [alias]word for the prompt", () => {
		const labeled = [
			{
				alias: "t1",
				tokenId: "id1",
				word: "In",
				charStart: 0,
				charEnd: 2,
			},
			{
				alias: "t2",
				tokenId: "id2",
				word: "the",
				charStart: 3,
				charEnd: 6,
			},
			{
				alias: "t3",
				tokenId: "id3",
				word: "beggining",
				charStart: 7,
				charEnd: 16,
			},
		]

		const out = renderLabeledWords(labeled)
		expect(out).toBe("[t1]In [t2]the [t3]beggining")
	})

	it("returns empty string for empty input", () => {
		expect(renderLabeledWords([])).toBe("")
	})
})

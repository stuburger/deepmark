import type { TokenAlignment } from "@mcp-gcse/shared"
import type { Schema } from "@tiptap/pm/model"
import { beforeAll, describe, expect, it } from "vitest"
import {
	resolveTokenAtCursor,
	resolveTokenRangeForSelection,
	resolveTokensForAnnotation,
	resolveTokensForRange,
} from "../token-resolution"

/**
 * Real PM schema for these tests — the `pmPosToAnswerChar` walk relies
 * on actual ProseMirror node + descendants semantics, so a mock doc
 * (like the one in use-derived-annotations.test.ts) would lie.
 */
async function buildSchema(): Promise<Schema> {
	const { getSchema } = await import("@tiptap/core")
	const Document = (await import("@tiptap/extension-document")).default
	const Text = (await import("@tiptap/extension-text")).default
	const HardBreak = (await import("@tiptap/extension-hard-break")).default
	const Bold = (await import("@tiptap/extension-bold")).default
	const Italic = (await import("@tiptap/extension-italic")).default
	const Underline = (await import("@tiptap/extension-underline")).default
	const { QuestionAnswerNode } = await import("../question-answer-node")
	const { ParagraphNode, OcrTokenMark, annotationMarks } = await import(
		"@mcp-gcse/shared"
	)

	return getSchema([
		Document.extend({ content: "(paragraph | questionAnswer)+" }),
		Text,
		HardBreak,
		Bold,
		Italic,
		Underline,
		ParagraphNode,
		QuestionAnswerNode,
		OcrTokenMark,
		...annotationMarks,
	])
}

function makeAlignment(
	entries: Array<[string, number, number]>,
): TokenAlignment {
	const tokenMap: Record<string, { start: number; end: number }> = {}
	for (const [id, start, end] of entries) tokenMap[id] = { start, end }
	return { tokenMap, confidence: 1 }
}

let schema: Schema
beforeAll(async () => {
	schema = await buildSchema()
})

// ─── resolveTokenAtCursor ──────────────────────────────────────────────────

describe("resolveTokenAtCursor", () => {
	it("returns the tokenId at a position inside an aligned word", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hello world" }],
				},
			],
		})
		const alignments = new Map([
			[
				"q1",
				makeAlignment([
					["t1", 0, 5],
					["t2", 6, 11],
				]),
			],
		])

		// PM pos 1 = char 0 (start of 'hello') — covered by t1.
		expect(resolveTokenAtCursor(doc, 1, alignments)).toBe("t1")
		// PM pos 4 = char 3 (inside 'hello') — covered by t1.
		expect(resolveTokenAtCursor(doc, 4, alignments)).toBe("t1")
		// PM pos 8 = char 7 (inside 'world') — covered by t2.
		expect(resolveTokenAtCursor(doc, 8, alignments)).toBe("t2")
	})

	it("falls back one char to the left when cursor sits at trailing edge", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hello world" }],
				},
			],
		})
		// t1 covers chars [0,5) — char 5 is NOT in t1 (exclusive end). The
		// fallback (char 4) IS in t1, so the cursor at the trailing edge of
		// 'hello' should still highlight t1.
		const alignments = new Map([["q1", makeAlignment([["t1", 0, 5]])]])
		// PM pos 6 = char 5 (right after 'hello', before space).
		expect(resolveTokenAtCursor(doc, 6, alignments)).toBe("t1")
	})

	it("returns null outside any question block", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "summary" }],
				},
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "answer" }],
				},
			],
		})
		const alignments = new Map([["q1", makeAlignment([["t1", 0, 6]])]])
		// pos 1 is inside the leading paragraph.
		expect(resolveTokenAtCursor(doc, 1, alignments)).toBeNull()
	})

	it("returns null when no alignment is loaded for the question", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hello" }],
				},
			],
		})
		expect(resolveTokenAtCursor(doc, 2, new Map())).toBeNull()
	})
})

// ─── resolveTokensForRange ────────────────────────────────────────────────

describe("resolveTokensForRange", () => {
	it("returns tokenIds inside a single-question selection", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hello world today" }],
				},
			],
		})
		const alignments = new Map([
			[
				"q1",
				makeAlignment([
					["t1", 0, 5],
					["t2", 6, 11],
					["t3", 12, 17],
				]),
			],
		])
		// Select 'hello world' → chars 0..11.
		const ids = resolveTokensForRange(doc, 1, 12, alignments)
		expect(ids?.sort()).toEqual(["t1", "t2"])
	})

	it("unions tokenIds when the selection crosses question boundaries", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "first" }],
				},
				{
					type: "questionAnswer",
					attrs: { questionId: "q2" },
					content: [{ type: "text", text: "second" }],
				},
			],
		})
		// q1 has t1, q2 has t2. Selection covers tail of q1 + head of q2.
		const alignments = new Map([
			["q1", makeAlignment([["t1", 0, 5]])],
			["q2", makeAlignment([["t2", 0, 6]])],
		])
		// PM layout:
		//   q1 occupies positions 0..7 (open, 'first' (5), close).
		//   q2 starts at position 7.
		// Selecting from pos 3 (inside q1) to pos 11 (inside q2) crosses the
		// block boundary and should return both tokens.
		const ids = resolveTokensForRange(doc, 3, 11, alignments)
		expect(ids?.sort()).toEqual(["t1", "t2"])
	})

	it("returns only the questions for which an alignment is loaded", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "first" }],
				},
				{
					type: "questionAnswer",
					attrs: { questionId: "q2" },
					content: [{ type: "text", text: "second" }],
				},
			],
		})
		const alignments = new Map([["q1", makeAlignment([["t1", 0, 5]])]])
		// Selection crosses both blocks; only q1 has an alignment → only t1.
		const ids = resolveTokensForRange(doc, 1, 13, alignments)
		expect(ids).toEqual(["t1"])
	})

	it("returns null when the selection doesn't overlap any question block", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "summary" }],
				},
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "answer" }],
				},
			],
		})
		const alignments = new Map([["q1", makeAlignment([["t1", 0, 6]])]])
		// pos 1..5 is inside the leading paragraph — no questionAnswer
		// overlap.
		expect(resolveTokensForRange(doc, 1, 5, alignments)).toBeNull()
	})

	it("returns null when no tokens overlap the answer-char range", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hello world" }],
				},
			],
		})
		// Only token covers chars [12,17), but the selection is chars [0,5).
		const alignments = new Map([["q1", makeAlignment([["t3", 12, 17]])]])
		expect(resolveTokensForRange(doc, 1, 6, alignments)).toBeNull()
	})

	it("deduplicates tokenIds across overlapping char ranges", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hello" }],
				},
			],
		})
		const alignments = new Map([["q1", makeAlignment([["t1", 0, 5]])]])
		const ids = resolveTokensForRange(doc, 1, 6, alignments)
		// Sanity: single token, single match — no duplicates.
		expect(ids).toEqual(["t1"])
	})
})

// ─── resolveTokensForAnnotation ───────────────────────────────────────────

describe("resolveTokensForAnnotation", () => {
	it("finds tokens for an annotation that starts at the first text child", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [
						{
							type: "text",
							marks: [{ type: "tick", attrs: { annotationId: "ann-1" } }],
							text: "hello",
						},
						{ type: "text", text: " world" },
					],
				},
			],
		})
		const alignments = new Map([
			[
				"q1",
				makeAlignment([
					["t1", 0, 5],
					["t2", 6, 11],
				]),
			],
		])
		expect(
			resolveTokensForAnnotation(doc, "ann-1", alignments)?.sort(),
		).toEqual(["t1"])
	})

	it("regression: finds tokens for an annotation NOT at the first marked child", () => {
		// This is the bug that shipped in 0a332ee and was fixed in 3f7a6be.
		// The old `if (!matches) return` exited the descendants callback the
		// moment it hit any text child whose marks didn't include the target
		// annotationId, silently abandoning every later child.
		//
		// The fixture needs the unannotated children to carry SOME mark
		// (here: bold) so they pass the `!child.marks.length` guard and
		// actually reach the `matches` check — that's the only path that
		// hits the buggy `return`. Without this, an "unannotated text" fixture
		// with no marks at all would short-circuit before the bug fired.
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [
						{
							type: "text",
							// Different annotation on the first child — passes the
							// marks-length guard but matches a different
							// annotationId, hitting the bug path.
							marks: [{ type: "tick", attrs: { annotationId: "ann-other" } }],
							text: "before ",
						},
						{
							type: "text",
							marks: [{ type: "tick", attrs: { annotationId: "ann-2" } }],
							text: "target",
						},
						{
							type: "text",
							marks: [{ type: "tick", attrs: { annotationId: "ann-other" } }],
							text: " after",
						},
					],
				},
			],
		})
		// textContent: "before target after"
		// 'target' lives at chars [7, 13). Make t-target cover it.
		const alignments = new Map([["q1", makeAlignment([["t-target", 7, 13]])]])
		expect(resolveTokensForAnnotation(doc, "ann-2", alignments)).toEqual([
			"t-target",
		])
	})

	it("merges char extents across multiple text children carrying the same annotationId", () => {
		// A bolded word in the middle of an annotated span breaks the run
		// into multiple text children — the annotation mark stays on each
		// child but the children are distinct PM nodes. The extent must
		// union all matching children, not just take the first.
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [
						{
							type: "text",
							marks: [{ type: "tick", attrs: { annotationId: "ann-3" } }],
							text: "left ",
						},
						{
							type: "text",
							marks: [
								{ type: "tick", attrs: { annotationId: "ann-3" } },
								{ type: "bold" },
							],
							text: "middle",
						},
						{
							type: "text",
							marks: [{ type: "tick", attrs: { annotationId: "ann-3" } }],
							text: " right",
						},
					],
				},
			],
		})
		// textContent: "left middle right" — 17 chars total. The annotation
		// covers the full extent [0, 17).
		const alignments = new Map([
			[
				"q1",
				makeAlignment([
					["t-l", 0, 4],
					["t-m", 5, 11],
					["t-r", 12, 17],
				]),
			],
		])
		const ids = resolveTokensForAnnotation(doc, "ann-3", alignments)
		expect(ids?.sort()).toEqual(["t-l", "t-m", "t-r"])
	})

	it("returns null when no mark with the annotationId exists", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [
						{
							type: "text",
							marks: [{ type: "tick", attrs: { annotationId: "ann-1" } }],
							text: "hello",
						},
					],
				},
			],
		})
		const alignments = new Map([["q1", makeAlignment([["t1", 0, 5]])]])
		expect(
			resolveTokensForAnnotation(doc, "ann-missing", alignments),
		).toBeNull()
	})

	it("returns null when alignment for the annotation's question isn't loaded", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [
						{
							type: "text",
							marks: [{ type: "tick", attrs: { annotationId: "ann-1" } }],
							text: "hello",
						},
					],
				},
			],
		})
		expect(resolveTokensForAnnotation(doc, "ann-1", new Map())).toBeNull()
	})
})

// ─── resolveTokenRangeForSelection ───────────────────────────────────────────

describe("resolveTokenRangeForSelection", () => {
	it("returns first and last token IDs in spatial order for a range inside one block", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hello world today" }],
				},
			],
		})
		const alignments = new Map([
			[
				"q1",
				makeAlignment([
					["t1", 0, 5],
					["t2", 6, 11],
					["t3", 12, 17],
				]),
			],
		])
		// PM positions 1..18 covers "hello world today" (chars 0..17).
		const result = resolveTokenRangeForSelection(doc, 1, 18, alignments)
		expect(result).toEqual({
			questionId: "q1",
			tokenStart: "t1",
			tokenEnd: "t3",
		})
	})

	it("sorts by spatial position even when tokenMap insertion order is jumbled", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hello world today" }],
				},
			],
		})
		// Intentionally out-of-order insertion: t3 first, then t1, then t2.
		const alignments = new Map([
			[
				"q1",
				makeAlignment([
					["t3", 12, 17],
					["t1", 0, 5],
					["t2", 6, 11],
				]),
			],
		])
		const result = resolveTokenRangeForSelection(doc, 1, 18, alignments)
		expect(result).toEqual({
			questionId: "q1",
			tokenStart: "t1",
			tokenEnd: "t3",
		})
	})

	it("returns null for a collapsed range", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hello" }],
				},
			],
		})
		const alignments = new Map([["q1", makeAlignment([["t1", 0, 5]])]])
		expect(resolveTokenRangeForSelection(doc, 4, 4, alignments)).toBeNull()
	})

	it("returns null when the range spans multiple question blocks", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "first" }],
				},
				{
					type: "questionAnswer",
					attrs: { questionId: "q2" },
					content: [{ type: "text", text: "second" }],
				},
			],
		})
		const alignments = new Map([
			["q1", makeAlignment([["t1", 0, 5]])],
			["q2", makeAlignment([["t2", 0, 6]])],
		])
		// Range covers both blocks.
		expect(resolveTokenRangeForSelection(doc, 1, 100, alignments)).toBeNull()
	})

	it("returns null when no alignment is loaded for the overlapping block", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hello" }],
				},
			],
		})
		expect(resolveTokenRangeForSelection(doc, 1, 6, new Map())).toBeNull()
	})

	it("returns null when the range falls entirely between aligned tokens", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hi  there" }],
				},
			],
		})
		// Alignment covers "hi" [0..2) and "there" [4..9). Range PM 3..4
		// = chars 2..3 = single whitespace between aligned tokens.
		const alignments = new Map([
			[
				"q1",
				makeAlignment([
					["t1", 0, 2],
					["t2", 4, 9],
				]),
			],
		])
		expect(resolveTokenRangeForSelection(doc, 3, 4, alignments)).toBeNull()
	})

	it("returns null when the range lies outside any question block", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "summary paragraph" }],
				},
			],
		})
		expect(resolveTokenRangeForSelection(doc, 1, 10, new Map())).toBeNull()
	})
})

import { describe, expect, it } from "vitest"
import { pmPosToAnswerChar } from "../pm-pos-mapping"

async function buildSchema() {
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

describe("pmPosToAnswerChar", () => {
	it("maps positions inside a plain question block to char offsets", async () => {
		const schema = await buildSchema()
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

		// Block layout in PM positions:
		//   pos 0       — before questionAnswer open
		//   pos 1       — inside, char 0 (right before 'h')
		//   pos 6       — inside, char 5 (between 'hello' and ' ')
		//   pos 12      — inside, char 11 (after 'd')
		//   pos 13      — after questionAnswer close
		expect(pmPosToAnswerChar(doc, 1)).toEqual({ questionId: "q1", char: 0 })
		expect(pmPosToAnswerChar(doc, 6)).toEqual({ questionId: "q1", char: 5 })
		expect(pmPosToAnswerChar(doc, 12)).toEqual({ questionId: "q1", char: 11 })
	})

	it("returns null for positions outside any question block", async () => {
		const schema = await buildSchema()
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

		// Position 1 is inside the leading paragraph — not a question block.
		expect(pmPosToAnswerChar(doc, 1)).toBeNull()
	})

	it("skips HardBreak nodes — positions either side map to the same char", async () => {
		// The architectural invariant this test guards: token alignment is
		// computed over `node.textContent`, which DROPS HardBreak. Cursor
		// positions on either side of a hardbreak must therefore both map
		// to the boundary char index of the surrounding text — otherwise
		// every keystroke past a Shift+Enter would highlight the wrong token.
		const schema = await buildSchema()
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [
						{ type: "text", text: "hello" },
						{ type: "hardBreak" },
						{ type: "text", text: "world" },
					],
				},
			],
		})

		// PM layout:
		//   pos 1        — char 0 (start of 'hello')
		//   pos 6        — char 5 (end of 'hello', just before hardBreak)
		//   pos 7        — char 5 (just after hardBreak — same char index!)
		//   pos 12       — char 10 (end of 'world')
		expect(pmPosToAnswerChar(doc, 1)).toEqual({ questionId: "q1", char: 0 })
		expect(pmPosToAnswerChar(doc, 6)).toEqual({ questionId: "q1", char: 5 })
		expect(pmPosToAnswerChar(doc, 7)).toEqual({ questionId: "q1", char: 5 })
		expect(pmPosToAnswerChar(doc, 12)).toEqual({ questionId: "q1", char: 10 })

		// Sanity: textContent confirms the layout we're testing against.
		expect(doc.firstChild?.textContent).toBe("helloworld")
	})

	it("handles multiple HardBreaks without compounding drift", async () => {
		const schema = await buildSchema()
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [
						{ type: "text", text: "a" },
						{ type: "hardBreak" },
						{ type: "text", text: "b" },
						{ type: "hardBreak" },
						{ type: "text", text: "c" },
					],
				},
			],
		})

		// textContent === "abc" (length 3). Any position past both
		// hardBreaks should land on char 2..3 — not 4..5.
		expect(doc.firstChild?.textContent).toBe("abc")
		// pos 1 — char 0 (before 'a')
		// pos 2 — char 1 (after 'a', before first hardBreak)
		// pos 3 — char 1 (inside / right after first hardBreak)
		// pos 4 — char 2 (after 'b')
		// pos 5 — char 2 (inside / right after second hardBreak)
		// pos 6 — char 3 (after 'c')
		expect(pmPosToAnswerChar(doc, 1)).toEqual({ questionId: "q1", char: 0 })
		expect(pmPosToAnswerChar(doc, 2)).toEqual({ questionId: "q1", char: 1 })
		expect(pmPosToAnswerChar(doc, 3)).toEqual({ questionId: "q1", char: 1 })
		expect(pmPosToAnswerChar(doc, 4)).toEqual({ questionId: "q1", char: 2 })
		expect(pmPosToAnswerChar(doc, 5)).toEqual({ questionId: "q1", char: 2 })
		expect(pmPosToAnswerChar(doc, 6)).toEqual({ questionId: "q1", char: 3 })
	})

	it("locates the right block when a position falls into the second question", async () => {
		const schema = await buildSchema()
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

		// q1 occupies positions 0..7 (open, "first" (5 chars), close).
		// q2 starts at position 7.
		expect(pmPosToAnswerChar(doc, 3)).toEqual({ questionId: "q1", char: 2 })
		expect(pmPosToAnswerChar(doc, 8)).toEqual({ questionId: "q2", char: 0 })
	})

	it("returns null for negative or out-of-bounds positions", async () => {
		const schema = await buildSchema()
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hi" }],
				},
			],
		})

		expect(pmPosToAnswerChar(doc, -1)).toBeNull()
		expect(pmPosToAnswerChar(doc, doc.content.size + 1)).toBeNull()
	})
})

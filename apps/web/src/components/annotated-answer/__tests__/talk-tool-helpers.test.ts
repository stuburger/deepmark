// @vitest-environment happy-dom

import type { Editor } from "@tiptap/core"
import type { Schema } from "@tiptap/pm/model"
import { beforeAll, describe, expect, it } from "vitest"
import { pmPosToCharInBlock } from "../pm-pos-mapping"
import {
	applyAnnotationByPhrase,
	charToPmPosInBlock,
	findAnnotationRange,
	findQuestionBlock,
	removeAnnotationById,
	updateAnnotationById,
} from "../talk-tool-helpers"

async function buildSchema(): Promise<Schema> {
	const { getSchema } = await import("@tiptap/core")
	const Document = (await import("@tiptap/extension-document")).default
	const Text = (await import("@tiptap/extension-text")).default
	const HardBreak = (await import("@tiptap/extension-hard-break")).default
	const Bold = (await import("@tiptap/extension-bold")).default
	const Italic = (await import("@tiptap/extension-italic")).default
	const Underline = (await import("@tiptap/extension-underline")).default
	const { QuestionAnswerNode } = await import("../question-answer-node")
	const { ParagraphNode, annotationMarks } = await import("@mcp-gcse/shared")

	return getSchema([
		Document.extend({ content: "(paragraph | questionAnswer)+" }),
		Text,
		HardBreak,
		Bold,
		Italic,
		Underline,
		ParagraphNode,
		QuestionAnswerNode,
		...annotationMarks,
	])
}

async function buildEditor(initialDoc: unknown): Promise<Editor> {
	const { Editor: EditorCtor } = await import("@tiptap/core")
	const Document = (await import("@tiptap/extension-document")).default
	const Text = (await import("@tiptap/extension-text")).default
	const HardBreak = (await import("@tiptap/extension-hard-break")).default
	const Bold = (await import("@tiptap/extension-bold")).default
	const Italic = (await import("@tiptap/extension-italic")).default
	const Underline = (await import("@tiptap/extension-underline")).default
	const { QuestionAnswerNode } = await import("../question-answer-node")
	const { ParagraphNode, annotationMarks } = await import("@mcp-gcse/shared")

	const host = document.createElement("div")
	document.body.appendChild(host)
	return new EditorCtor({
		element: host,
		content: initialDoc as never,
		extensions: [
			Document.extend({ content: "(paragraph | questionAnswer)+" }),
			Text,
			HardBreak,
			Bold,
			Italic,
			Underline,
			ParagraphNode,
			QuestionAnswerNode,
			...annotationMarks,
		],
	})
}

let schema: Schema
beforeAll(async () => {
	schema = await buildSchema()
})

// ─── findQuestionBlock ──────────────────────────────────────────────────────

describe("findQuestionBlock", () => {
	it("returns the block matching questionId", () => {
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
		const found = findQuestionBlock(doc, "q2")
		expect(found).not.toBeNull()
		expect(found?.node.attrs.questionId).toBe("q2")
		expect(found?.node.textContent).toBe("second")
	})

	it("returns null when no block matches", () => {
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
		expect(findQuestionBlock(doc, "missing")).toBeNull()
	})
})

// ─── charToPmPosInBlock ─────────────────────────────────────────────────────

describe("charToPmPosInBlock", () => {
	it("round-trips with pmPosToCharInBlock across text-only content", () => {
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
		const block = findQuestionBlock(doc, "q1")
		if (!block) throw new Error("block missing")
		// Round-trip: PM pos → char → PM pos.
		for (let pmPos = block.blockStart; pmPos <= block.blockEnd; pmPos++) {
			const char = pmPosToCharInBlock(block.node, block.blockStart, pmPos)
			if (char === null) continue
			const back = charToPmPosInBlock(block.node, block.blockStart, char)
			expect(back).toBe(pmPos)
		}
	})

	it("returns null for char beyond block content length", () => {
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
		const block = findQuestionBlock(doc, "q1")
		if (!block) throw new Error("block missing")
		expect(charToPmPosInBlock(block.node, block.blockStart, 100)).toBeNull()
	})
})

// ─── findAnnotationRange ────────────────────────────────────────────────────

describe("findAnnotationRange", () => {
	it("returns the range of a single-text-node mark", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [
						{ type: "text", text: "hello " },
						{
							type: "text",
							text: "world",
							marks: [{ type: "tick", attrs: { annotationId: "ann-1" } }],
						},
					],
				},
			],
		})
		const found = findAnnotationRange(doc, "ann-1")
		expect(found).not.toBeNull()
		expect(found?.mark.type.name).toBe("tick")
	})

	it("returns the union range when the mark spans multiple text nodes (split by bold)", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [
						{
							type: "text",
							text: "hello ",
							marks: [{ type: "tick", attrs: { annotationId: "ann-1" } }],
						},
						{
							type: "text",
							text: "bold",
							marks: [
								{ type: "tick", attrs: { annotationId: "ann-1" } },
								{ type: "bold" },
							],
						},
						{
							type: "text",
							text: " world",
							marks: [{ type: "tick", attrs: { annotationId: "ann-1" } }],
						},
					],
				},
			],
		})
		const found = findAnnotationRange(doc, "ann-1")
		if (!found) throw new Error("mark missing")
		// The full mark range covers "hello bold world" (15 chars + 2 PM
		// boundary positions for the block open/close above blockStart).
		expect(found.to - found.from).toBe("hello bold world".length)
	})

	it("returns null when no mark matches", () => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "no marks" }],
				},
			],
		})
		expect(findAnnotationRange(doc, "missing")).toBeNull()
	})
})

// ─── apply / update / remove (editor-backed) ────────────────────────────────

describe("applyAnnotationByPhrase", () => {
	it("applies a tick mark at the phrase's exact match", async () => {
		const editor = await buildEditor({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hello world today" }],
				},
			],
		})
		try {
			const result = applyAnnotationByPhrase(editor, {
				questionId: "q1",
				phrase: "world",
				signal: "tick",
				reason: "good use",
			})
			expect(result.ok).toBe(true)
			if (result.ok) {
				const range = findAnnotationRange(editor.state.doc, result.annotationId)
				expect(range?.mark.type.name).toBe("tick")
				expect(range?.mark.attrs.source).toBe("teacher")
				expect(range?.mark.attrs.reason).toBe("good use")
			}
		} finally {
			editor.destroy()
		}
	})

	it("fails when the phrase is not in the answer", async () => {
		const editor = await buildEditor({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hello world" }],
				},
			],
		})
		try {
			const result = applyAnnotationByPhrase(editor, {
				questionId: "q1",
				phrase: "missing phrase",
				signal: "tick",
				reason: "x",
			})
			expect(result.ok).toBe(false)
			if (!result.ok) expect(result.reason).toContain("not found")
		} finally {
			editor.destroy()
		}
	})

	it("fails when the phrase appears more than once (ambiguous)", async () => {
		const editor = await buildEditor({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "the cat sat on the mat" }],
				},
			],
		})
		try {
			const result = applyAnnotationByPhrase(editor, {
				questionId: "q1",
				phrase: "the",
				signal: "underline",
				reason: "x",
			})
			expect(result.ok).toBe(false)
			if (!result.ok) expect(result.reason).toContain("more than once")
		} finally {
			editor.destroy()
		}
	})
})

describe("updateAnnotationById", () => {
	it("updates the payload while keeping the same mark type", async () => {
		const editor = await buildEditor({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hello world" }],
				},
			],
		})
		try {
			const add = applyAnnotationByPhrase(editor, {
				questionId: "q1",
				phrase: "world",
				signal: "tick",
				reason: "good",
			})
			if (!add.ok) throw new Error("add failed")

			const result = updateAnnotationById(editor, {
				annotationId: add.annotationId,
				comment: "added a comment",
			})
			expect(result.ok).toBe(true)

			const range = findAnnotationRange(editor.state.doc, add.annotationId)
			expect(range?.mark.attrs.comment).toBe("added a comment")
			expect(range?.mark.type.name).toBe("tick")
		} finally {
			editor.destroy()
		}
	})

	it("changes the mark type when the signal changes", async () => {
		const editor = await buildEditor({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hello world" }],
				},
			],
		})
		try {
			const add = applyAnnotationByPhrase(editor, {
				questionId: "q1",
				phrase: "world",
				signal: "tick",
				reason: "x",
			})
			if (!add.ok) throw new Error("add failed")

			updateAnnotationById(editor, {
				annotationId: add.annotationId,
				signal: "cross",
			})

			const range = findAnnotationRange(editor.state.doc, add.annotationId)
			expect(range?.mark.type.name).toBe("cross")
			expect(range?.mark.attrs.sentiment).toBe("negative")
		} finally {
			editor.destroy()
		}
	})

	it("returns ok:false when the annotationId doesn't exist", async () => {
		const editor = await buildEditor({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hello" }],
				},
			],
		})
		try {
			const result = updateAnnotationById(editor, {
				annotationId: "missing",
				comment: "x",
			})
			expect(result.ok).toBe(false)
		} finally {
			editor.destroy()
		}
	})
})

describe("removeAnnotationById", () => {
	it("removes the mark across its full range", async () => {
		const editor = await buildEditor({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hello world" }],
				},
			],
		})
		try {
			const add = applyAnnotationByPhrase(editor, {
				questionId: "q1",
				phrase: "world",
				signal: "tick",
				reason: "x",
			})
			if (!add.ok) throw new Error("add failed")
			expect(
				findAnnotationRange(editor.state.doc, add.annotationId),
			).not.toBeNull()

			const result = removeAnnotationById(editor, add.annotationId)
			expect(result.ok).toBe(true)
			expect(findAnnotationRange(editor.state.doc, add.annotationId)).toBeNull()
		} finally {
			editor.destroy()
		}
	})

	it("returns ok:false when the annotationId doesn't exist", async () => {
		const editor = await buildEditor({
			type: "doc",
			content: [
				{
					type: "questionAnswer",
					attrs: { questionId: "q1" },
					content: [{ type: "text", text: "hello" }],
				},
			],
		})
		try {
			const result = removeAnnotationById(editor, "missing")
			expect(result.ok).toBe(false)
		} finally {
			editor.destroy()
		}
	})
})

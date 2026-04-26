import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap"
import { afterEach, describe, expect, it } from "vitest"
import type * as Y from "yjs"
import {
	applyAnnotationMark,
	applyOcrTokenMarks,
	insertMcqTableBlock,
	insertQuestionBlock,
	setAnswerText,
	setQuestionScore,
} from "../../src/lib/collab/editor-ops"
import { getEditorSchema } from "../../src/lib/collab/editor-schema"
import { createTestEditor } from "./helpers/test-editor"

type DocJson = {
	type: "doc"
	content: Array<{
		type: string
		attrs?: Record<string, unknown>
		content?: Array<{
			type: string
			text?: string
			marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
		}>
	}>
}

function readJson(doc: Y.Doc): DocJson {
	return yXmlFragmentToProsemirrorJSON(doc.getXmlFragment("doc")) as DocJson
}

const editors: Array<{ cleanup: () => void }> = []
function makeEditor() {
	const e = createTestEditor()
	editors.push(e)
	return e
}

afterEach(() => {
	while (editors.length > 0) editors.pop()?.cleanup()
})

describe("insertQuestionBlock", () => {
	it("inserts a questionAnswer block with the supplied attrs", () => {
		const { doc, view } = makeEditor()
		insertQuestionBlock(view, {
			questionId: "q1",
			questionNumber: "1",
			questionText: "What is 2+2?",
			maxScore: 3,
		})

		const json = readJson(doc)
		expect(json.content).toHaveLength(1)
		expect(json.content[0].type).toBe("questionAnswer")
		expect(json.content[0].attrs).toMatchObject({
			questionId: "q1",
			questionNumber: "1",
			questionText: "What is 2+2?",
			maxScore: 3,
		})
		expect(json.content[0].content ?? []).toEqual([])
	})

	it("is idempotent: a second call for the same questionId is a no-op", () => {
		const { doc, view } = makeEditor()
		insertQuestionBlock(view, { questionId: "q1", questionNumber: "1" })
		const stateSizeBefore = view.state.doc.content.size

		insertQuestionBlock(view, {
			questionId: "q1",
			questionNumber: "1",
			questionText: "Different text now — should be ignored.",
			maxScore: 99,
		})

		const json = readJson(doc)
		expect(json.content).toHaveLength(1)
		expect(json.content[0].attrs).toMatchObject({
			questionId: "q1",
			questionNumber: "1",
		})
		// Original attrs are preserved (no overwrite of questionText/maxScore).
		expect(json.content[0].attrs?.questionText ?? null).toBeNull()
		expect(json.content[0].attrs?.maxScore ?? null).toBeNull()
		// Doc size unchanged confirms no spurious ops.
		expect(view.state.doc.content.size).toBe(stateSizeBefore)
	})

	it("appends additional questions when called with new questionIds", () => {
		const { doc, view } = makeEditor()
		insertQuestionBlock(view, { questionId: "q1", questionNumber: "1" })
		insertQuestionBlock(view, { questionId: "q2", questionNumber: "2" })
		insertQuestionBlock(view, { questionId: "q3", questionNumber: "3" })

		const json = readJson(doc)
		expect(json.content.map((b) => b.attrs?.questionId)).toEqual([
			"q1",
			"q2",
			"q3",
		])
	})
})

describe("setAnswerText", () => {
	it("populates only the named question's text", () => {
		const { doc, view } = makeEditor()
		insertQuestionBlock(view, { questionId: "q1", questionNumber: "1" })
		insertQuestionBlock(view, { questionId: "q2", questionNumber: "2" })

		setAnswerText(view, "q1", "Answer for q1.")

		const json = readJson(doc)
		expect(json.content[0].content).toEqual([
			{ type: "text", text: "Answer for q1." },
		])
		expect(json.content[1].content ?? []).toEqual([])
	})

	it("is a no-op when the question block does not exist", () => {
		const { doc, view } = makeEditor()
		insertQuestionBlock(view, { questionId: "q1", questionNumber: "1" })

		setAnswerText(view, "missing", "Should not appear.")

		const json = readJson(doc)
		expect(json.content).toHaveLength(1)
		expect(json.content[0].content ?? []).toEqual([])
	})

	it("is idempotent: a second call against a populated block is a no-op (preserves teacher edits)", () => {
		// Re-grade creates a new submission with a fresh empty Y.Doc, so the
		// grade Lambda's projection runs against an empty block and fills
		// it. But the Lambda may also re-run on an existing populated doc
		// (manual retry, SQS redelivery) — in that case setAnswerText must
		// NOT overwrite, because the inline content is editable in the
		// teacher's UI and may carry their corrections to the OCR-stitched
		// answer_text.
		const { doc, view } = makeEditor()
		insertQuestionBlock(view, { questionId: "q1", questionNumber: "1" })
		setAnswerText(view, "q1", "first version")
		setAnswerText(view, "q1", "second version — should NOT win")

		const json = readJson(doc)
		expect(json.content[0].content).toEqual([
			{ type: "text", text: "first version" },
		])
	})
})

describe("applyOcrTokenMarks", () => {
	it("attaches an ocrToken mark per word range", () => {
		const { doc, view } = makeEditor()
		insertQuestionBlock(view, { questionId: "q1", questionNumber: "1" })
		setAnswerText(view, "q1", "hello world")
		applyOcrTokenMarks(view, "q1", [
			{
				id: "tok-hello",
				bbox: [10, 20, 30, 40],
				pageOrder: 1,
				charStart: 0,
				charEnd: 5,
			},
			{
				id: "tok-world",
				bbox: [10, 60, 30, 100],
				pageOrder: 1,
				charStart: 6,
				charEnd: 11,
			},
		])

		const json = readJson(doc)
		const segments = json.content[0].content ?? []

		// "hello", " ", "world" — three segments (the space carries no token mark)
		expect(segments).toHaveLength(3)
		expect(segments[0].text).toBe("hello")
		expect(segments[0].marks?.[0]).toEqual({
			type: "ocrToken",
			attrs: { tokenId: "tok-hello", bbox: [10, 20, 30, 40], pageOrder: 1 },
		})
		expect(segments[1].text).toBe(" ")
		expect(segments[1].marks ?? []).toEqual([])
		expect(segments[2].text).toBe("world")
		expect(segments[2].marks?.[0]).toEqual({
			type: "ocrToken",
			attrs: { tokenId: "tok-world", bbox: [10, 60, 30, 100], pageOrder: 1 },
		})
	})

	it("is a no-op when the question has no text yet", () => {
		const { doc, view } = makeEditor()
		insertQuestionBlock(view, { questionId: "q1", questionNumber: "1" })
		applyOcrTokenMarks(view, "q1", [
			{
				id: "tok-1",
				bbox: [0, 0, 10, 10],
				pageOrder: 1,
				charStart: 0,
				charEnd: 5,
			},
		])

		const json = readJson(doc)
		expect(json.content[0].content ?? []).toEqual([])
	})

	it("preserves existing annotation marks while adding token marks", () => {
		const { doc, view } = makeEditor()
		insertQuestionBlock(view, { questionId: "q1", questionNumber: "1" })
		setAnswerText(view, "q1", "tick this")
		applyAnnotationMark(view, "q1", {
			signal: "tick",
			sentiment: "positive",
			from: 0,
			to: 4,
			attrs: { annotationId: "ai-1", reason: "correct" },
		})
		applyOcrTokenMarks(view, "q1", [
			{
				id: "tok-tick",
				bbox: [10, 20, 30, 40],
				pageOrder: 1,
				charStart: 0,
				charEnd: 4,
			},
			{
				id: "tok-this",
				bbox: [10, 60, 30, 100],
				pageOrder: 1,
				charStart: 5,
				charEnd: 9,
			},
		])

		const json = readJson(doc)
		const segments = json.content[0].content ?? []
		// "tick" carries both the tick annotation and the token mark
		const tickSeg = segments.find((s) => s.text === "tick")
		expect(tickSeg).toBeDefined()
		const markTypes = tickSeg?.marks?.map((m) => m.type) ?? []
		expect(markTypes).toContain("tick")
		expect(markTypes).toContain("ocrToken")
	})
})

describe("applyAnnotationMark", () => {
	it("attaches a tick mark to the named character range", () => {
		const { doc, view } = makeEditor()
		insertQuestionBlock(view, { questionId: "q1", questionNumber: "1" })
		setAnswerText(view, "q1", "good answer here")
		applyAnnotationMark(view, "q1", {
			signal: "tick",
			sentiment: "positive",
			from: 0,
			to: 4,
			attrs: { annotationId: "ai-1", reason: "correct" },
		})

		const json = readJson(doc)
		const segments = json.content[0].content ?? []
		const tickSeg = segments.find((s) =>
			s.marks?.some((m) => m.type === "tick"),
		)
		expect(tickSeg?.text).toBe("good")
		const tickMark = tickSeg?.marks?.find((m) => m.type === "tick")
		expect(tickMark?.attrs).toMatchObject({
			annotationId: "ai-1",
			reason: "correct",
			sentiment: "positive",
		})
	})

	it("uses the underline tiptap mark name when signal=underline", () => {
		const { doc, view } = makeEditor()
		insertQuestionBlock(view, { questionId: "q1", questionNumber: "1" })
		setAnswerText(view, "q1", "key phrase here")
		applyAnnotationMark(view, "q1", {
			signal: "underline",
			sentiment: "neutral",
			from: 4,
			to: 10,
			attrs: { annotationId: "ai-2", reason: "noted" },
		})

		const json = readJson(doc)
		const segments = json.content[0].content ?? []
		const underlineSeg = segments.find((s) =>
			s.marks?.some((m) => m.type === "annotationUnderline"),
		)
		expect(underlineSeg?.text).toBe("phrase")
	})

	it("is a no-op when the range is out of bounds", () => {
		const { doc, view } = makeEditor()
		insertQuestionBlock(view, { questionId: "q1", questionNumber: "1" })
		setAnswerText(view, "q1", "short")
		applyAnnotationMark(view, "q1", {
			signal: "tick",
			sentiment: "positive",
			from: 100,
			to: 200,
			attrs: { annotationId: "ai-x" },
		})

		const json = readJson(doc)
		// Text unchanged, no annotation marks.
		const segments = json.content[0].content ?? []
		expect(segments).toEqual([{ type: "text", text: "short" }])
	})

	it("can apply two non-overlapping marks on the same block", () => {
		const { doc, view } = makeEditor()
		insertQuestionBlock(view, { questionId: "q1", questionNumber: "1" })
		setAnswerText(view, "q1", "good and bad parts")
		applyAnnotationMark(view, "q1", {
			signal: "tick",
			sentiment: "positive",
			from: 0,
			to: 4,
			attrs: { annotationId: "ai-good" },
		})
		applyAnnotationMark(view, "q1", {
			signal: "cross",
			sentiment: "negative",
			from: 9,
			to: 12,
			attrs: { annotationId: "ai-bad" },
		})

		const json = readJson(doc)
		const segments = json.content[0].content ?? []
		const tickSeg = segments.find((s) =>
			s.marks?.some((m) => m.type === "tick"),
		)
		const crossSeg = segments.find((s) =>
			s.marks?.some((m) => m.type === "cross"),
		)
		expect(tickSeg?.text).toBe("good")
		expect(crossSeg?.text).toBe("bad")
	})
})

describe("schema parity sanity", () => {
	it("exposes a doc node and the canonical mark types from getEditorSchema", () => {
		const schema = getEditorSchema()
		expect(schema.topNodeType.name).toBe("doc")
		expect(schema.nodes.questionAnswer).toBeDefined()
		expect(schema.nodes.mcqTable).toBeDefined()
		expect(schema.nodes.paragraph).toBeDefined()
		expect(schema.marks.tick).toBeDefined()
		expect(schema.marks.cross).toBeDefined()
		expect(schema.marks.annotationUnderline).toBeDefined()
		expect(schema.marks.ocrToken).toBeDefined()
	})
})

describe("setQuestionScore", () => {
	it("sets awardedScore as an attr on the question block", () => {
		const { doc, view } = makeEditor()
		insertQuestionBlock(view, {
			questionId: "q1",
			questionNumber: "1",
			maxScore: 4,
		})
		// Default before grading.
		expect(readJson(doc).content[0].attrs?.awardedScore ?? null).toBeNull()

		setQuestionScore(view, "q1", 3)

		const json = readJson(doc)
		expect(json.content[0].attrs?.awardedScore).toBe(3)
		// Other attrs preserved.
		expect(json.content[0].attrs?.questionId).toBe("q1")
		expect(json.content[0].attrs?.maxScore).toBe(4)
	})

	it("preserves the answer text when updating the score", () => {
		const { doc, view } = makeEditor()
		insertQuestionBlock(view, {
			questionId: "q1",
			questionNumber: "1",
			maxScore: 2,
		})
		setAnswerText(view, "q1", "this is my answer")
		setQuestionScore(view, "q1", 1)

		const json = readJson(doc)
		const fragments = json.content[0].content ?? []
		const text = fragments.map((f) => f.text ?? "").join("")
		expect(text).toBe("this is my answer")
		expect(json.content[0].attrs?.awardedScore).toBe(1)
	})

	it("supports a score of 0 (incorrect / not awarded)", () => {
		const { doc, view } = makeEditor()
		insertQuestionBlock(view, {
			questionId: "q1",
			questionNumber: "1",
			maxScore: 1,
		})
		setQuestionScore(view, "q1", 0)
		expect(readJson(doc).content[0].attrs?.awardedScore).toBe(0)
	})

	it("no-op when the question block doesn't exist", () => {
		const { doc, view } = makeEditor()
		insertQuestionBlock(view, { questionId: "q1", questionNumber: "1" })
		const before = readJson(doc)

		setQuestionScore(view, "q-does-not-exist", 5)

		const after = readJson(doc)
		expect(after).toEqual(before)
	})
})

describe("insertMcqTableBlock", () => {
	const opts = [
		{ option_label: "A", option_text: "Wedding cakes" },
		{ option_label: "B", option_text: "Custom furniture" },
		{ option_label: "C", option_text: "Tinned food" },
		{ option_label: "D", option_text: "Designer dresses" },
	]

	const baseRow = {
		questionNumber: "1.1",
		questionText: null,
		maxScore: 1,
		options: opts,
		correctLabels: ["A"],
		awardedScore: null,
	}

	it("inserts a single mcqTable atom holding every MCQ row", () => {
		const { doc, view } = makeEditor()
		insertMcqTableBlock(view, [
			{ ...baseRow, questionId: "q1.1", studentAnswer: "C" },
			{
				...baseRow,
				questionId: "q1.2",
				questionNumber: "1.2",
				studentAnswer: "A",
			},
		])

		const json = readJson(doc)
		expect(json.content).toHaveLength(1)
		expect(json.content[0].type).toBe("mcqTable")
		const results = json.content[0].attrs?.results as Array<{
			questionId: string
			studentAnswer: string | null
		}>
		expect(results.map((r) => r.questionId)).toEqual(["q1.1", "q1.2"])
	})

	it("is idempotent — does not insert a second mcqTable", () => {
		const { doc, view } = makeEditor()
		insertMcqTableBlock(view, [
			{ ...baseRow, questionId: "q1.1", studentAnswer: "C" },
		])
		insertMcqTableBlock(view, [
			{ ...baseRow, questionId: "q1.2", studentAnswer: "B" },
		])

		const json = readJson(doc)
		expect(json.content.filter((b) => b.type === "mcqTable")).toHaveLength(1)
	})

	it("setQuestionScore updates a single MCQ row's awardedScore inside the table", () => {
		const { doc, view } = makeEditor()
		insertMcqTableBlock(view, [
			{ ...baseRow, questionId: "q1.1", studentAnswer: "C" },
			{
				...baseRow,
				questionId: "q1.2",
				questionNumber: "1.2",
				studentAnswer: "A",
			},
		])

		setQuestionScore(view, "q1.2", 1)

		const json = readJson(doc)
		const results = json.content[0].attrs?.results as Array<{
			questionId: string
			awardedScore: number | null
			studentAnswer: string
		}>
		const r1 = results.find((r) => r.questionId === "q1.1")
		const r2 = results.find((r) => r.questionId === "q1.2")
		expect(r2?.awardedScore).toBe(1)
		expect(r1?.awardedScore).toBeNull()
		// Other fields preserved.
		expect(r2?.studentAnswer).toBe("A")
	})
})

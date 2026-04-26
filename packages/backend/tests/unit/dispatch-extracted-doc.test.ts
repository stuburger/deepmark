import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap"
import { afterEach, describe, expect, it } from "vitest"
import type * as Y from "yjs"
import { dispatchExtractedDocOps } from "../../src/lib/collab/editor-seed"
import { createTestEditor } from "./helpers/test-editor"

/**
 * `dispatchExtractedDoc` is the *only* editor write the OCR Lambda makes.
 * It must produce the complete final doc shape (skeleton + answer text +
 * ocrToken marks) in a single sweep over the question list. These tests
 * drive the inner ops directly via `dispatchExtractedDocOps` against a
 * real headless EditorView so the assertions cover the same code path
 * that runs in production.
 */

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

describe("dispatchExtractedDocOps", () => {
	it("inserts question blocks in order, leaves blocks empty when no answer", () => {
		const { doc, view } = makeEditor()
		dispatchExtractedDocOps(
			view,
			[
				{
					questionId: "q1",
					questionNumber: "1",
					questionText: null,
					maxScore: 1,
				},
				{
					questionId: "q2",
					questionNumber: "2",
					questionText: null,
					maxScore: 2,
				},
				{
					questionId: "q3",
					questionNumber: "3",
					questionText: null,
					maxScore: 3,
				},
			],
			[],
		)

		const json = readJson(doc)
		expect(json.content.length).toBe(3)
		expect(json.content.map((b) => b.attrs?.questionNumber)).toEqual([
			"1",
			"2",
			"3",
		])
		expect(json.content.map((b) => b.attrs?.questionId)).toEqual([
			"q1",
			"q2",
			"q3",
		])
		// All blocks empty (no inline content).
		for (const block of json.content) {
			expect(block.content).toBeUndefined()
		}
	})

	it("populates answer text only for questions with non-empty text", () => {
		const { doc, view } = makeEditor()
		dispatchExtractedDocOps(
			view,
			[
				{
					questionId: "q1",
					questionNumber: "1",
					questionText: null,
					maxScore: 1,
				},
				{
					questionId: "q2",
					questionNumber: "2",
					questionText: null,
					maxScore: 1,
				},
			],
			[
				{ questionId: "q1", text: "hello world", tokens: [] },
				{ questionId: "q2", text: "", tokens: [] },
			],
		)

		const json = readJson(doc)
		const q1 = json.content.find((b) => b.attrs?.questionId === "q1")
		const q2 = json.content.find((b) => b.attrs?.questionId === "q2")
		expect(q1?.content?.[0]?.text).toBe("hello world")
		expect(q2?.content).toBeUndefined()
	})

	it("applies ocrToken marks to text spans matching the per-token alignment", () => {
		const { doc, view } = makeEditor()
		dispatchExtractedDocOps(
			view,
			[
				{
					questionId: "q1",
					questionNumber: "1",
					questionText: null,
					maxScore: 1,
				},
			],
			[
				{
					questionId: "q1",
					text: "hello world",
					tokens: [
						{
							id: "tok-1",
							page_order: 0,
							para_index: 0,
							line_index: 0,
							word_index: 0,
							text_raw: "hello",
							bbox: [0, 0, 100, 100],
							confidence: 1,
						},
						{
							id: "tok-2",
							page_order: 0,
							para_index: 0,
							line_index: 0,
							word_index: 1,
							text_raw: "world",
							bbox: [100, 0, 200, 100],
							confidence: 1,
						},
					],
				},
			],
		)

		const json = readJson(doc)
		const q1 = json.content[0]
		// PM splits text into separate text nodes per distinct mark set, so
		// the question's answer reads back as multiple text fragments. The
		// concatenated text equals the original answer.
		const fragments = q1?.content ?? []
		const concatText = fragments.map((f) => f.text ?? "").join("")
		expect(concatText).toBe("hello world")

		const tokenIds = new Set<string>()
		for (const f of fragments) {
			for (const m of f.marks ?? []) {
				if (m.type === "ocrToken" && m.attrs?.tokenId) {
					tokenIds.add(m.attrs.tokenId as string)
				}
			}
		}
		expect([...tokenIds].sort()).toEqual(["tok-1", "tok-2"])
	})

	it("is idempotent on repeat call with the same inputs (within a single view)", () => {
		const { doc, view } = makeEditor()
		const seeds = [
			{
				questionId: "q1",
				questionNumber: "1",
				questionText: null,
				maxScore: 1,
			},
			{
				questionId: "q2",
				questionNumber: "2",
				questionText: null,
				maxScore: 1,
			},
		]
		const answers = [{ questionId: "q1", text: "first answer", tokens: [] }]

		dispatchExtractedDocOps(view, seeds, answers)
		dispatchExtractedDocOps(view, seeds, answers)

		const json = readJson(doc)
		expect(json.content.length).toBe(2)
		expect(
			json.content.find((b) => b.attrs?.questionId === "q1")?.content?.[0]
				?.text,
		).toBe("first answer")
	})

	it("preserves teacher edits when re-dispatched against a doc with already-populated text", () => {
		// Simulates the grade Lambda being invoked twice against the same
		// Y.Doc (e.g. SQS redelivery, manual retry, or a future flow that
		// re-runs grading). The first dispatch establishes the OCR text;
		// between calls a teacher fixes a misread word; the second
		// dispatch must NOT clobber the teacher's correction.
		const { doc, view } = makeEditor()
		const seeds = [
			{
				questionId: "q1",
				questionNumber: "1",
				questionText: null,
				maxScore: 1,
			},
		]

		dispatchExtractedDocOps(view, seeds, [
			{ questionId: "q1", text: "OCR thinks this says hellp", tokens: [] },
		])

		// Teacher edits inline: replace "hellp" with "hello".
		const tr = view.state.tr.replaceWith(
			view.state.doc.content.size - "hellp".length - 1,
			view.state.doc.content.size - 1,
			view.state.schema.text("hello"),
		)
		view.dispatch(tr)

		// Grade Lambda re-runs (e.g. an SQS retry). Same OCR text from DB.
		dispatchExtractedDocOps(view, seeds, [
			{ questionId: "q1", text: "OCR thinks this says hellp", tokens: [] },
		])

		const json = readJson(doc)
		expect(json.content[0]?.content?.[0]?.text).toBe(
			"OCR thinks this says hello",
		)
	})

	it("no-op when questions list is empty", () => {
		const { doc, view } = makeEditor()
		dispatchExtractedDocOps(view, [], [])
		const json = readJson(doc)
		// Empty fragment renders as a single empty paragraph (ySyncPlugin
		// auto-fill). No questionAnswer blocks.
		expect(json.content.filter((b) => b.type === "questionAnswer").length).toBe(
			0,
		)
	})

	it("inserts the mcqTable BEFORE any questionAnswer blocks, regardless of question order", () => {
		const { doc, view } = makeEditor()
		// Mixed paper: MCQ first, written, MCQ, written. Final doc order
		// must be: mcqTable (rows for both MCQs in original order), then
		// the two questionAnswer blocks. Matches legacy `build-doc.ts`.
		dispatchExtractedDocOps(
			view,
			[
				{
					questionId: "mcq1",
					questionNumber: "01.1",
					questionText: "Which option?",
					maxScore: 1,
					questionType: "multiple_choice",
					options: [
						{ option_label: "A", option_text: "Apple" },
						{ option_label: "B", option_text: "Banana" },
					],
					correctLabels: ["B"],
				},
				{
					questionId: "wq1",
					questionNumber: "02",
					questionText: null,
					maxScore: 2,
					questionType: "written",
				},
				{
					questionId: "mcq2",
					questionNumber: "03.1",
					questionText: null,
					maxScore: 1,
					questionType: "multiple_choice",
					options: [
						{ option_label: "A", option_text: "x" },
						{ option_label: "B", option_text: "y" },
					],
					correctLabels: ["A"],
				},
				{
					questionId: "wq2",
					questionNumber: "04",
					questionText: null,
					maxScore: 5,
					questionType: "written",
				},
			],
			[
				{ questionId: "mcq1", text: "B", tokens: [] },
				{ questionId: "wq1", text: "first written", tokens: [] },
				{ questionId: "mcq2", text: "A", tokens: [] },
				{ questionId: "wq2", text: "second written", tokens: [] },
			],
		)

		const json = readJson(doc)
		expect(json.content.map((b) => b.type)).toEqual([
			"mcqTable",
			"questionAnswer",
			"questionAnswer",
		])
		const mcqTable = json.content[0]
		expect(mcqTable?.attrs?.results).toEqual([
			expect.objectContaining({
				questionId: "mcq1",
				questionNumber: "01.1",
				studentAnswer: "B",
				correctLabels: ["B"],
			}),
			expect.objectContaining({
				questionId: "mcq2",
				questionNumber: "03.1",
				studentAnswer: "A",
				correctLabels: ["A"],
			}),
		])
		expect(json.content.slice(1).map((b) => b.attrs?.questionNumber)).toEqual([
			"02",
			"04",
		])
	})

	it("ignores answers whose questionId isn't in the seed list", () => {
		const { doc, view } = makeEditor()
		dispatchExtractedDocOps(
			view,
			[
				{
					questionId: "q1",
					questionNumber: "1",
					questionText: null,
					maxScore: 1,
				},
			],
			[
				{ questionId: "q1", text: "kept", tokens: [] },
				{ questionId: "q-orphan", text: "dropped", tokens: [] },
			],
		)
		const json = readJson(doc)
		expect(json.content.filter((b) => b.type === "questionAnswer").length).toBe(
			1,
		)
		expect(json.content[0]?.content?.[0]?.text).toBe("kept")
	})
})

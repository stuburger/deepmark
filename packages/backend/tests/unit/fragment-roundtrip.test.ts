import { deriveAnnotationsFromDoc } from "@mcp-gcse/shared"
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap"
import { afterEach, describe, expect, it } from "vitest"
import { getEditorSchema } from "../../src/lib/collab/editor-schema"
import {
	applyAnnotationMark,
	applyOcrTokenMarks,
	insertQuestionBlock,
	setAnswerText,
} from "../../src/lib/collab/editor-ops"
import { createTestEditor } from "./helpers/test-editor"

const editors: Array<{ cleanup: () => void }> = []
function makeEditor() {
	const e = createTestEditor()
	editors.push(e)
	return e
}
afterEach(() => {
	while (editors.length > 0) editors.pop()?.cleanup()
})

/**
 * Round-trip the Lambda-side ops through the same derivation function the
 * client and the projection Lambda use. If schema or mark-attr drift
 * breaks the round trip, this catches it.
 */
describe("fragment round-trip via deriveAnnotationsFromDoc", () => {
	it("an op-built fragment yields the AI annotations the projection expects", () => {
		const { doc, view } = makeEditor()
		const schema = getEditorSchema()

		insertQuestionBlock(view, {
			questionId: "q1",
			questionNumber: "1",
			questionText: "Define an island.",
			maxScore: 2,
		})
		setAnswerText(view, "q1", "an island is land surrounded by water")

		applyOcrTokenMarks(view, "q1", [
			{
				id: "tok-an",
				bbox: [10, 0, 20, 20],
				pageOrder: 1,
				charStart: 0,
				charEnd: 2,
			},
			{
				id: "tok-island",
				bbox: [10, 25, 20, 80],
				pageOrder: 1,
				charStart: 3,
				charEnd: 9,
			},
			{
				id: "tok-is",
				bbox: [10, 85, 20, 100],
				pageOrder: 1,
				charStart: 10,
				charEnd: 12,
			},
			{
				id: "tok-land",
				bbox: [10, 105, 20, 145],
				pageOrder: 1,
				charStart: 13,
				charEnd: 17,
			},
		])

		applyAnnotationMark(view, "q1", {
			signal: "tick",
			sentiment: "positive",
			from: 3,
			to: 9,
			attrs: {
				annotationId: "ai-tick-island",
				reason: "key term identified",
				scanBbox: [10, 25, 20, 80],
				scanPageOrder: 1,
				scanTokenStartId: "tok-island",
				scanTokenEndId: "tok-island",
			},
		})

		applyAnnotationMark(view, "q1", {
			signal: "underline",
			sentiment: "neutral",
			from: 13,
			to: 17,
			attrs: {
				annotationId: "ai-underline-land",
				reason: "definition core",
				scanBbox: [10, 105, 20, 145],
				scanPageOrder: 1,
				scanTokenStartId: "tok-land",
				scanTokenEndId: "tok-land",
			},
		})

		const json = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment("doc"))
		const pmDoc = schema.nodeFromJSON(json)
		const annotations = deriveAnnotationsFromDoc(pmDoc)

		expect(annotations).toHaveLength(2)

		const tickAnn = annotations.find((a) => a.id === "ai-tick-island")
		expect(tickAnn).toBeDefined()
		expect(tickAnn?.overlay_type).toBe("annotation")
		expect(tickAnn?.question_id).toBe("q1")
		expect(tickAnn?.bbox).toEqual([10, 25, 20, 80])
		expect(tickAnn?.page_order).toBe(1)
		expect(tickAnn?.anchor_token_start_id).toBe("tok-island")
		expect(tickAnn?.anchor_token_end_id).toBe("tok-island")

		const underlineAnn = annotations.find((a) => a.id === "ai-underline-land")
		expect(underlineAnn).toBeDefined()
		expect(underlineAnn?.bbox).toEqual([10, 105, 20, 145])
	})

	it("re-running the same ops twice yields the same annotation set", () => {
		const { doc, view } = makeEditor()
		const schema = getEditorSchema()

		const seed = () => {
			insertQuestionBlock(view, { questionId: "q1", questionNumber: "1" })
			setAnswerText(view, "q1", "the answer text")
			applyOcrTokenMarks(view, "q1", [
				{
					id: "tok-1",
					bbox: [0, 0, 10, 10],
					pageOrder: 1,
					charStart: 0,
					charEnd: 3,
				},
				{
					id: "tok-2",
					bbox: [0, 11, 10, 21],
					pageOrder: 1,
					charStart: 4,
					charEnd: 10,
				},
				{
					id: "tok-3",
					bbox: [0, 22, 10, 32],
					pageOrder: 1,
					charStart: 11,
					charEnd: 15,
				},
			])
			applyAnnotationMark(view, "q1", {
				signal: "tick",
				sentiment: "positive",
				from: 0,
				to: 3,
				attrs: {
					annotationId: "ai-1",
					scanBbox: [0, 0, 10, 10],
					scanPageOrder: 1,
					scanTokenStartId: "tok-1",
					scanTokenEndId: "tok-1",
				},
			})
		}

		seed()
		const first = deriveAnnotationsFromDoc(
			schema.nodeFromJSON(
				yXmlFragmentToProsemirrorJSON(doc.getXmlFragment("doc")),
			),
		)

		seed()
		const second = deriveAnnotationsFromDoc(
			schema.nodeFromJSON(
				yXmlFragmentToProsemirrorJSON(doc.getXmlFragment("doc")),
			),
		)

		expect(first.map((a) => a.id)).toEqual(second.map((a) => a.id))
		expect(first[0].bbox).toEqual(second[0].bbox)
	})
})

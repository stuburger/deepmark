import type { GradingResult, PageToken } from "@/lib/marking/types"
import { type TokenAlignment, buildAnnotatedDoc } from "@mcp-gcse/shared"
import type { Node as PmNode } from "@tiptap/pm/model"
import { describe, expect, it } from "vitest"
import { deriveAnnotationsFromDoc } from "../use-derived-annotations"

// ─── Helpers to build mock PM nodes ────────────────────────────────────────

type MockMark = {
	type: { name: string }
	attrs: Record<string, unknown>
}

type MockTextNode = {
	isText: true
	marks: MockMark[]
	nodeSize: number
	textContent: string
}

type MockNode = {
	type: { name: string }
	attrs: Record<string, unknown>
	childCount: number
	child: (i: number) => MockTextNode
}

/**
 * Build a minimal mock PM doc that satisfies deriveAnnotationsFromDoc's
 * interface (doc.descendants + node.childCount/child + text node shape).
 */
function mockDoc(questionAnswers: MockNode[]): PmNode {
	return {
		descendants: (
			callback: (node: unknown, pos: number, parent: unknown) => void,
		) => {
			let pos = 0
			for (const qa of questionAnswers) {
				callback(qa, pos, null)
				pos += 100 // arbitrary spacing
			}
		},
	} as unknown as PmNode
}

/**
 * `offset` is preserved on each child for documentation only — production
 * uses cumulative `nodeSize` to compute char offsets, so test expectations
 * for offset-derived dedupe keys must align with the cumulative sum.
 */
function mockQuestionAnswer(
	questionId: string,
	children: { text: string; offset: number; marks: MockMark[] }[],
): MockNode {
	const textNodes: MockTextNode[] = children.map((c) => ({
		isText: true,
		marks: c.marks,
		nodeSize: c.text.length,
		textContent: c.text,
	}))
	return {
		type: { name: "questionAnswer" },
		attrs: { questionId },
		childCount: textNodes.length,
		child: (i: number) => textNodes[i],
	}
}

function mockMark(
	typeName: string,
	attrs: Record<string, unknown> = {},
): MockMark {
	return {
		type: { name: typeName },
		attrs: { sentiment: "neutral", reason: null, annotationId: null, ...attrs },
	}
}

function mockOcrToken(
	tokenId: string,
	bbox: [number, number, number, number],
	pageOrder = 1,
): MockMark {
	return {
		type: { name: "ocrToken" },
		attrs: { tokenId, bbox, pageOrder },
	}
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("deriveAnnotationsFromDoc", () => {
	it("derives annotation from an AI tick mark with ocrToken data", () => {
		const doc = mockDoc([
			mockQuestionAnswer("q1", [
				{
					text: "answer",
					offset: 4,
					marks: [
						mockMark("tick", {
							annotationId: "ai-1",
							sentiment: "positive",
						}),
						mockOcrToken("t2", [100, 110, 120, 200]),
					],
				},
			]),
		])

		const result = deriveAnnotationsFromDoc(doc)

		expect(result).toHaveLength(1)
		expect(result[0].id).toBe("ai-1")
		expect(result[0].overlay_type).toBe("annotation")
		expect(result[0].question_id).toBe("q1")
		expect(result[0].anchor_token_start_id).toBe("t2")
		expect(result[0].anchor_token_end_id).toBe("t2")
		expect(result[0].bbox).toEqual([100, 110, 120, 200])
		expect(result[0].sentiment).toBe("positive")
		expect((result[0].payload as { signal: string }).signal).toBe("tick")
	})

	it("derives annotation from a teacher mark (no annotationId)", () => {
		const doc = mockDoc([
			mockQuestionAnswer("q1", [
				{
					text: "The",
					offset: 0,
					marks: [
						mockMark("cross", { sentiment: "negative" }),
						mockOcrToken("t1", [100, 50, 120, 100]),
					],
				},
			]),
		])

		const result = deriveAnnotationsFromDoc(doc)

		expect(result).toHaveLength(1)
		// Teacher marks get a deterministic key-based ID
		expect(result[0].id).toBe("q1-cross-0-3")
		// grading_run_id is always null for editor-derived annotations;
		// server decides source + linkage on save via the diff.
		expect(result[0].grading_run_id).toBe(null)
		expect(result[0].overlay_type).toBe("annotation")
		expect(result[0].sentiment).toBe("negative")
		expect((result[0].payload as { signal: string }).signal).toBe("cross")
	})

	it("skips marks on text without ocrToken marks", () => {
		const doc = mockDoc([
			mockQuestionAnswer("q1", [
				{
					text: "xyz",
					offset: 50,
					marks: [mockMark("tick")], // no ocrToken → no bbox
				},
			]),
		])

		const result = deriveAnnotationsFromDoc(doc)
		expect(result).toHaveLength(0)
	})

	it("produces separate annotations for overlapping marks", () => {
		const doc = mockDoc([
			mockQuestionAnswer("q1", [
				{
					text: "answer",
					offset: 4,
					marks: [
						mockMark("tick", { sentiment: "positive" }),
						mockMark("box", { sentiment: "positive" }),
						mockOcrToken("t2", [100, 110, 120, 200]),
					],
				},
			]),
		])

		const result = deriveAnnotationsFromDoc(doc)

		expect(result).toHaveLength(2)
		const types = result.map((a) => (a.payload as { signal?: string }).signal)
		expect(types).toContain("tick")
		expect(types).toContain("box")
	})

	it("returns empty array for empty doc (no questionAnswer nodes)", () => {
		const doc = mockDoc([])
		const result = deriveAnnotationsFromDoc(doc)
		expect(result).toHaveLength(0)
	})

	it("returns empty when text has no ocrToken marks", () => {
		const doc = mockDoc([
			mockQuestionAnswer("q1", [
				{
					text: "answer",
					offset: 4,
					marks: [mockMark("tick")], // no ocrToken
				},
			]),
		])

		const result = deriveAnnotationsFromDoc(doc)
		expect(result).toHaveLength(0)
	})

	it("skips nodes without questionId", () => {
		const doc = mockDoc([
			{
				type: { name: "questionAnswer" },
				attrs: { questionId: null },
				childCount: 0,
				child: () => {
					throw new Error("not called")
				},
			},
		])

		const result = deriveAnnotationsFromDoc(doc)
		expect(result).toHaveLength(0)
	})

	it("derives signal annotation with AO attrs from tick mark", () => {
		const doc = mockDoc([
			mockQuestionAnswer("q1", [
				{
					text: "answer",
					offset: 4,
					marks: [
						mockMark("tick", {
							sentiment: "positive",
							ao_category: "AO2",
							ao_display: "AO2",
							ao_quality: "valid",
						}),
						mockOcrToken("t2", [100, 110, 120, 200]),
					],
				},
			]),
		])

		const result = deriveAnnotationsFromDoc(doc)

		expect(result).toHaveLength(1)
		expect(result[0].overlay_type).toBe("annotation")
		expect((result[0].payload as { ao_category: string }).ao_category).toBe(
			"AO2",
		)
	})

	it("derives chain annotations", () => {
		const doc = mockDoc([
			mockQuestionAnswer("q1", [
				{
					text: "The answer",
					offset: 0,
					marks: [
						mockMark("chain", {
							chainType: "evaluation",
							phrase: "because",
						}),
						mockOcrToken("t1", [100, 50, 120, 200]),
					],
				},
			]),
		])

		const result = deriveAnnotationsFromDoc(doc)

		expect(result).toHaveLength(1)
		expect(result[0].overlay_type).toBe("chain")
		expect((result[0].payload as { chainType: string }).chainType).toBe(
			"evaluation",
		)
	})

	it("computes bbox hull across multiple tokens", () => {
		// Annotation spans two text nodes (split at word boundary by ocrToken marks)
		const doc = mockDoc([
			mockQuestionAnswer("q1", [
				{
					text: "The",
					offset: 0,
					marks: [
						mockMark("annotationUnderline", {
							annotationId: "ann-1",
						}),
						mockOcrToken("t1", [100, 50, 120, 100]),
					],
				},
				{
					text: " answer",
					offset: 3,
					marks: [
						mockMark("annotationUnderline", {
							annotationId: "ann-1",
						}),
						mockOcrToken("t2", [100, 110, 120, 200]),
					],
				},
				{
					text: " is",
					offset: 10,
					marks: [
						mockMark("annotationUnderline", {
							annotationId: "ann-1",
						}),
						mockOcrToken("t3", [100, 210, 120, 240]),
					],
				},
			]),
		])

		const result = deriveAnnotationsFromDoc(doc)

		expect(result).toHaveLength(1)
		// Hull of t1, t2, t3 bboxes
		expect(result[0].bbox).toEqual([100, 50, 120, 240])
		expect(result[0].anchor_token_start_id).toBe("t1")
		expect(result[0].anchor_token_end_id).toBe("t3")
	})

	it("handles multiple questions in one doc", () => {
		const doc = mockDoc([
			mockQuestionAnswer("q1", [
				{
					text: "The",
					offset: 0,
					marks: [mockMark("tick"), mockOcrToken("t1", [100, 50, 120, 100])],
				},
			]),
			mockQuestionAnswer("q2", [
				{
					text: "yes",
					offset: 0,
					marks: [
						mockMark("cross"),
						mockOcrToken("t4", [200, 50, 220, 100], 2),
					],
				},
			]),
		])

		const result = deriveAnnotationsFromDoc(doc)

		expect(result).toHaveLength(2)
		expect(result[0].question_id).toBe("q1")
		expect(result[1].question_id).toBe("q2")
	})

	it("ignores non-annotation marks (unknown mark types)", () => {
		const doc = mockDoc([
			mockQuestionAnswer("q1", [
				{
					text: "answer",
					offset: 4,
					marks: [
						mockMark("bold"), // not an annotation mark
						mockOcrToken("t2", [100, 110, 120, 200]),
					],
				},
			]),
		])

		const result = deriveAnnotationsFromDoc(doc)
		expect(result).toHaveLength(0)
	})

	it("uses scanBbox from AI marks instead of ocrToken data", () => {
		const doc = mockDoc([
			mockQuestionAnswer("q1", [
				{
					text: "answer",
					offset: 4,
					marks: [
						mockMark("tick", {
							annotationId: "ai-1",
							scanBbox: [50, 60, 70, 80],
							scanPageOrder: 3,
							scanTokenStartId: "scan-t1",
							scanTokenEndId: "scan-t2",
						}),
						mockOcrToken("t2", [100, 110, 120, 200]),
					],
				},
			]),
		])

		const result = deriveAnnotationsFromDoc(doc)

		expect(result).toHaveLength(1)
		// Uses the embedded scan data, not the ocrToken data
		expect(result[0].bbox).toEqual([50, 60, 70, 80])
		expect(result[0].page_order).toBe(3)
		expect(result[0].anchor_token_start_id).toBe("scan-t1")
		expect(result[0].anchor_token_end_id).toBe("scan-t2")
	})
})

// ─── Integration test: real tiptap schema ──────────────────────────────────

describe("deriveAnnotationsFromDoc (real PM schema)", () => {
	it("round-trips: buildAnnotatedDoc → PM parse → derive matches original annotation", async () => {
		const { getSchema } = await import("@tiptap/core")
		const Document = (await import("@tiptap/extension-document")).default
		const Text = (await import("@tiptap/extension-text")).default
		const HardBreak = (await import("@tiptap/extension-hard-break")).default
		const { QuestionAnswerNode } = await import("../question-answer-node")
		const { annotationMarks, OcrTokenMark } = await import("@mcp-gcse/shared")

		const schema = getSchema([
			Document.extend({ content: "questionAnswer+" }),
			Text,
			HardBreak,
			QuestionAnswerNode,
			OcrTokenMark,
			...annotationMarks,
		])

		const gradingResults: GradingResult[] = [
			{
				question_id: "q1",
				question_number: "1",
				question_text: "What is the answer?",
				student_answer: "The answer is correct",
				marking_method: "point_based",
				awarded_score: 1,
				max_score: 1,
				llm_reasoning: "",
				feedback_summary: "",
			},
		]

		const marks = new Map([
			[
				"q1",
				[
					{
						from: 4,
						to: 10,
						type: "tick" as const,
						sentiment: "positive" as const,
						attrs: { reason: "correct key term" },
						annotationId: "ann-1",
					},
				],
			],
		])

		const tokens: PageToken[] = [
			{
				id: "t1",
				text_raw: "The",
				text_corrected: "The",
				bbox: [10, 10, 20, 40],
				page_order: 1,
				para_index: 0,
				line_index: 0,
				word_index: 0,
				confidence: 0.99,
				question_id: "q1",
				answer_char_start: null,
				answer_char_end: null,
			},
			{
				id: "t2",
				text_raw: "answer",
				text_corrected: "answer",
				bbox: [10, 50, 20, 100],
				page_order: 1,
				para_index: 0,
				line_index: 0,
				word_index: 1,
				confidence: 0.99,
				question_id: "q1",
				answer_char_start: null,
				answer_char_end: null,
			},
			{
				id: "t3",
				text_raw: "is",
				text_corrected: "is",
				bbox: [10, 110, 20, 130],
				page_order: 1,
				para_index: 0,
				line_index: 0,
				word_index: 2,
				confidence: 0.99,
				question_id: "q1",
				answer_char_start: null,
				answer_char_end: null,
			},
			{
				id: "t4",
				text_raw: "correct",
				text_corrected: "correct",
				bbox: [10, 140, 20, 200],
				page_order: 1,
				para_index: 0,
				line_index: 0,
				word_index: 3,
				confidence: 0.99,
				question_id: "q1",
				answer_char_start: null,
				answer_char_end: null,
			},
		]

		const alignment: TokenAlignment = {
			tokenMap: {
				t1: { start: 0, end: 3 },
				t2: { start: 4, end: 10 },
				t3: { start: 11, end: 13 },
				t4: { start: 14, end: 21 },
			},
			confidence: 1.0,
		}

		const jsonDoc = buildAnnotatedDoc(
			gradingResults,
			marks,
			new Map([["q1", alignment]]),
			new Map([["q1", tokens]]),
		)
		const pmDoc = schema.nodeFromJSON(jsonDoc)

		const result = deriveAnnotationsFromDoc(pmDoc)

		// Should produce exactly one annotation for the tick on "answer"
		expect(result).toHaveLength(1)
		expect(result[0].id).toBe("ann-1")
		expect(result[0].overlay_type).toBe("annotation")
		expect(result[0].anchor_token_start_id).toBe("t2")
		expect(result[0].anchor_token_end_id).toBe("t2")
		expect(result[0].bbox).toEqual([10, 50, 20, 100])
		expect((result[0].payload as { signal: string }).signal).toBe("tick")
	})
})

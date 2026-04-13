import type { TokenAlignment } from "@/lib/marking/token-alignment"
import type { GradingResult } from "@/lib/marking/types"
import type { PageToken } from "@/lib/marking/types"
import type { Node as PmNode } from "@tiptap/pm/model"
import { describe, expect, it } from "vitest"
import { buildAnnotatedDoc } from "../build-doc"
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
}

type MockNode = {
	type: { name: string }
	attrs: Record<string, unknown>
	forEach: (
		callback: (child: MockTextNode, offset: number, index: number) => void,
	) => void
}

/**
 * Build a minimal mock PM doc that satisfies deriveAnnotationsFromDoc's
 * interface (doc.descendants + node.forEach + text node shape).
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

function mockQuestionAnswer(
	questionId: string,
	children: { text: string; offset: number; marks: MockMark[] }[],
): MockNode {
	return {
		type: { name: "questionAnswer" },
		attrs: { questionId },
		forEach: (callback) => {
			for (let i = 0; i < children.length; i++) {
				const child = children[i]
				callback(
					{
						isText: true,
						marks: child.marks,
						nodeSize: child.text.length,
					},
					child.offset,
					i,
				)
			}
		},
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

// ─── Test fixtures ─────────────────────────────────────────────────────────

const TOKEN_A: PageToken = {
	id: "t1",
	text_raw: "The",
	text_corrected: "The",
	bbox: [100, 50, 120, 100],
	page_order: 1,
	para_index: 0,
	line_index: 0,
	word_index: 0,
	confidence: 0.99,
	question_id: "q1",
	answer_char_start: null,
	answer_char_end: null,
}

const TOKEN_B: PageToken = {
	id: "t2",
	text_raw: "answer",
	text_corrected: "answer",
	bbox: [100, 110, 120, 200],
	page_order: 1,
	para_index: 0,
	line_index: 0,
	word_index: 1,
	confidence: 0.99,
	question_id: "q1",
	answer_char_start: null,
	answer_char_end: null,
}

const TOKEN_C: PageToken = {
	id: "t3",
	text_raw: "is",
	text_corrected: "is",
	bbox: [100, 210, 120, 240],
	page_order: 1,
	para_index: 0,
	line_index: 0,
	word_index: 2,
	confidence: 0.99,
	question_id: "q1",
	answer_char_start: null,
	answer_char_end: null,
}

// "The answer is" → tokens at char offsets 0-3, 4-10, 11-13
const ALIGNMENT: TokenAlignment = {
	tokenMap: {
		t1: { start: 0, end: 3 },
		t2: { start: 4, end: 10 },
		t3: { start: 11, end: 13 },
	},
	confidence: 1.0,
}

const TOKENS = [TOKEN_A, TOKEN_B, TOKEN_C]

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("deriveAnnotationsFromDoc", () => {
	it("derives annotation from an AI tick mark (with annotationId)", () => {
		const doc = mockDoc([
			mockQuestionAnswer("q1", [
				{
					text: "answer",
					offset: 4, // "answer" starts at char 4
					marks: [
						mockMark("tick", { annotationId: "ai-1", sentiment: "positive" }),
					],
				},
			]),
		])

		const alignments = new Map([["q1", ALIGNMENT]])
		const tokensMap = new Map([["q1", TOKENS]])

		const result = deriveAnnotationsFromDoc(doc, alignments, tokensMap)

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
					marks: [mockMark("cross", { sentiment: "negative" })],
				},
			]),
		])

		const alignments = new Map([["q1", ALIGNMENT]])
		const tokensMap = new Map([["q1", TOKENS]])

		const result = deriveAnnotationsFromDoc(doc, alignments, tokensMap)

		expect(result).toHaveLength(1)
		// Teacher marks get a deterministic key-based ID
		expect(result[0].id).toBe("q1-cross-0-3")
		expect(result[0].enrichment_run_id).toBe("teacher")
		expect(result[0].overlay_type).toBe("annotation")
		expect(result[0].sentiment).toBe("negative")
		expect((result[0].payload as { signal: string }).signal).toBe("cross")
	})

	it("skips marks on text that doesn't align to any tokens", () => {
		const doc = mockDoc([
			mockQuestionAnswer("q1", [
				{
					text: "xyz",
					offset: 50, // char 50-53 — no tokens at these offsets
					marks: [mockMark("tick")],
				},
			]),
		])

		const alignments = new Map([["q1", ALIGNMENT]])
		const tokensMap = new Map([["q1", TOKENS]])

		const result = deriveAnnotationsFromDoc(doc, alignments, tokensMap)
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
					],
				},
			]),
		])

		const alignments = new Map([["q1", ALIGNMENT]])
		const tokensMap = new Map([["q1", TOKENS]])

		const result = deriveAnnotationsFromDoc(doc, alignments, tokensMap)

		expect(result).toHaveLength(2)
		const types = result.map((a) => (a.payload as { signal?: string }).signal)
		expect(types).toContain("tick")
		expect(types).toContain("box")
	})

	it("returns empty array for empty doc (no questionAnswer nodes)", () => {
		const doc = mockDoc([])

		const alignments = new Map([["q1", ALIGNMENT]])
		const tokensMap = new Map([["q1", TOKENS]])

		const result = deriveAnnotationsFromDoc(doc, alignments, tokensMap)
		expect(result).toHaveLength(0)
	})

	it("returns empty when question has no alignment data", () => {
		const doc = mockDoc([
			mockQuestionAnswer("q1", [
				{
					text: "answer",
					offset: 4,
					marks: [mockMark("tick")],
				},
			]),
		])

		// No alignment for q1
		const alignments = new Map<string, TokenAlignment>()
		const tokensMap = new Map([["q1", TOKENS]])

		const result = deriveAnnotationsFromDoc(doc, alignments, tokensMap)
		expect(result).toHaveLength(0)
	})

	it("returns empty when question has no tokens", () => {
		const doc = mockDoc([
			mockQuestionAnswer("q1", [
				{
					text: "answer",
					offset: 4,
					marks: [mockMark("tick")],
				},
			]),
		])

		const alignments = new Map([["q1", ALIGNMENT]])
		const tokensMap = new Map<string, PageToken[]>()

		const result = deriveAnnotationsFromDoc(doc, alignments, tokensMap)
		expect(result).toHaveLength(0)
	})

	it("skips nodes without questionId", () => {
		const doc = mockDoc([
			{
				type: { name: "questionAnswer" },
				attrs: { questionId: null },
				forEach: () => {},
			},
		])

		const alignments = new Map([["q1", ALIGNMENT]])
		const tokensMap = new Map([["q1", TOKENS]])

		const result = deriveAnnotationsFromDoc(doc, alignments, tokensMap)
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
					],
				},
			]),
		])

		const alignments = new Map([["q1", ALIGNMENT]])
		const tokensMap = new Map([["q1", TOKENS]])

		const result = deriveAnnotationsFromDoc(doc, alignments, tokensMap)

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
					],
				},
			]),
		])

		const alignments = new Map([["q1", ALIGNMENT]])
		const tokensMap = new Map([["q1", TOKENS]])

		const result = deriveAnnotationsFromDoc(doc, alignments, tokensMap)

		expect(result).toHaveLength(1)
		expect(result[0].overlay_type).toBe("chain")
		expect((result[0].payload as { chainType: string }).chainType).toBe(
			"evaluation",
		)
	})

	it("computes bbox hull across multiple tokens", () => {
		const doc = mockDoc([
			mockQuestionAnswer("q1", [
				{
					text: "The answer is",
					offset: 0, // spans all 3 tokens (0-13)
					marks: [mockMark("annotationUnderline")],
				},
			]),
		])

		const alignments = new Map([["q1", ALIGNMENT]])
		const tokensMap = new Map([["q1", TOKENS]])

		const result = deriveAnnotationsFromDoc(doc, alignments, tokensMap)

		expect(result).toHaveLength(1)
		// Hull of t1, t2, t3 bboxes
		expect(result[0].bbox).toEqual([100, 50, 120, 240])
		expect(result[0].anchor_token_start_id).toBe("t1")
		expect(result[0].anchor_token_end_id).toBe("t3")
	})

	it("handles multiple questions in one doc", () => {
		const q2Token: PageToken = {
			id: "t4",
			text_raw: "yes",
			text_corrected: "yes",
			bbox: [200, 50, 220, 100],
			page_order: 2,
			para_index: 0,
			line_index: 0,
			word_index: 0,
			confidence: 0.99,
			question_id: "q2",
			answer_char_start: null,
			answer_char_end: null,
		}

		const q2Alignment: TokenAlignment = {
			tokenMap: { t4: { start: 0, end: 3 } },
			confidence: 1.0,
		}

		const doc = mockDoc([
			mockQuestionAnswer("q1", [
				{
					text: "The",
					offset: 0,
					marks: [mockMark("tick")],
				},
			]),
			mockQuestionAnswer("q2", [
				{
					text: "yes",
					offset: 0,
					marks: [mockMark("cross")],
				},
			]),
		])

		const alignments = new Map([
			["q1", ALIGNMENT],
			["q2", q2Alignment],
		])
		const tokensMap = new Map([
			["q1", TOKENS],
			["q2", [q2Token]],
		])

		const result = deriveAnnotationsFromDoc(doc, alignments, tokensMap)

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
					marks: [mockMark("bold")], // not an annotation mark
				},
			]),
		])

		const alignments = new Map([["q1", ALIGNMENT]])
		const tokensMap = new Map([["q1", TOKENS]])

		const result = deriveAnnotationsFromDoc(doc, alignments, tokensMap)
		expect(result).toHaveLength(0)
	})
})

// ─── Integration test: real tiptap schema ──────────────────────────────────
// Validates that PM's node.forEach childOffset semantics match our
// char-offset assumption — the mock tests can't catch this.

describe("deriveAnnotationsFromDoc (real PM schema)", () => {
	it("round-trips: buildAnnotatedDoc → PM parse → derive matches original annotation", async () => {
		// Dynamically import tiptap to build a real schema + doc
		const { getSchema } = await import("@tiptap/core")
		const Document = (await import("@tiptap/extension-document")).default
		const Text = (await import("@tiptap/extension-text")).default
		const HardBreak = (await import("@tiptap/extension-hard-break")).default
		const { QuestionAnswerNode } = await import("../question-answer-node")
		const { annotationMarks } = await import("../annotation-marks")

		const schema = getSchema([
			Document.extend({ content: "questionAnswer+" }),
			Text,
			HardBreak,
			QuestionAnswerNode,
			...annotationMarks,
		])

		// Build a JSON doc with one question that has a tick mark on "answer"
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

		const jsonDoc = buildAnnotatedDoc(gradingResults, marks)
		const pmDoc = schema.nodeFromJSON(jsonDoc)

		// The answer "The answer is correct" has these tokens:
		// "The" → 0-3, "answer" → 4-10, "is" → 11-13, "correct" → 14-21
		const alignment: TokenAlignment = {
			tokenMap: {
				t1: { start: 0, end: 3 },
				t2: { start: 4, end: 10 },
				t3: { start: 11, end: 13 },
				t4: { start: 14, end: 21 },
			},
			confidence: 1.0,
		}

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

		const alignments = new Map([["q1", alignment]])
		const tokensMap = new Map([["q1", tokens]])

		const result = deriveAnnotationsFromDoc(pmDoc, alignments, tokensMap)

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

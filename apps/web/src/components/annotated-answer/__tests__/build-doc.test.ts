import type { TextMark } from "@/lib/marking/token-alignment"
import type { GradingResult } from "@/lib/marking/types"
import { describe, expect, it } from "vitest"
import { buildAnnotatedDoc } from "../build-doc"

function makeGradingResult(
	questionId: string,
	questionNumber: string,
	studentAnswer: string,
	markingMethod = "point_based",
): GradingResult {
	return {
		question_id: questionId,
		question_text: `Question ${questionNumber}`,
		question_number: questionNumber,
		student_answer: studentAnswer,
		awarded_score: 2,
		max_score: 4,
		llm_reasoning: "",
		feedback_summary: "",
		marking_method: markingMethod as GradingResult["marking_method"],
	}
}

function makeMark(
	from: number,
	to: number,
	type: TextMark["type"] = "tick",
): TextMark {
	return {
		from,
		to,
		type,
		sentiment: "positive",
		attrs: { reason: "test reason" },
		annotationId: `a-${from}-${to}`,
	}
}

describe("buildAnnotatedDoc", () => {
	it("builds a doc with one question and no marks", () => {
		const results = [makeGradingResult("q1", "1a", "The cell membrane")]
		const doc = buildAnnotatedDoc(results, new Map())

		expect(doc.type).toBe("doc")
		expect(doc.content).toHaveLength(1)
		expect(doc.content?.[0].type).toBe("questionAnswer")
		expect(doc.content?.[0].attrs?.questionId).toBe("q1")
		expect(doc.content?.[0].attrs?.questionNumber).toBe("1a")
		expect(doc.content?.[0].content).toHaveLength(1)
		expect(doc.content?.[0].content?.[0].text).toBe("The cell membrane")
	})

	it("builds a doc with one question and one mark", () => {
		const results = [makeGradingResult("q1", "1a", "The cell membrane")]
		const marks = new Map([["q1", [makeMark(4, 8, "underline")]]])
		const doc = buildAnnotatedDoc(results, marks)

		const content = doc.content?.[0].content ?? []
		// Should split into: "The " (plain), "cell" (marked), " membrane" (plain)
		expect(content).toHaveLength(3)
		expect(content[0].text).toBe("The ")
		expect(content[0].marks).toBeUndefined()
		expect(content[1].text).toBe("cell")
		expect(content[1].marks).toHaveLength(1)
		expect(content[1].marks?.[0].type).toBe("annotationUnderline")
		expect(content[2].text).toBe(" membrane")
	})

	it("builds a doc with multiple questions", () => {
		const results = [
			makeGradingResult("q1", "1a", "Answer one"),
			makeGradingResult("q2", "1b", "Answer two"),
		]
		const doc = buildAnnotatedDoc(results, new Map())

		expect(doc.content).toHaveLength(2)
		expect(doc.content?.[0].attrs?.questionNumber).toBe("1a")
		expect(doc.content?.[1].attrs?.questionNumber).toBe("1b")
	})

	it("handles overlapping marks", () => {
		const results = [makeGradingResult("q1", "1a", "The cell membrane")]
		const marks = new Map([
			[
				"q1",
				[
					makeMark(0, 8, "chain"), // "The cell"
					makeMark(4, 17, "tick"), // "cell membrane"
				],
			],
		])
		const doc = buildAnnotatedDoc(results, marks)
		const content = doc.content?.[0].content ?? []

		// Boundaries: 0, 4, 8, 17 → 3 segments
		expect(content).toHaveLength(3)
		expect(content[0].text).toBe("The ")
		expect(content[0].marks).toHaveLength(1) // chain only
		expect(content[1].text).toBe("cell")
		expect(content[1].marks).toHaveLength(2) // chain + tick
		expect(content[2].text).toBe(" membrane")
		expect(content[2].marks).toHaveLength(1) // tick only
	})

	it("skips MCQ questions", () => {
		const results = [
			makeGradingResult("q1", "1a", "Answer one"),
			makeGradingResult("q2", "1b", "B", "deterministic"),
			makeGradingResult("q3", "2", "Answer three"),
		]
		const doc = buildAnnotatedDoc(results, new Map())

		expect(doc.content).toHaveLength(2)
		expect(doc.content?.[0].attrs?.questionId).toBe("q1")
		expect(doc.content?.[1].attrs?.questionId).toBe("q3")
	})

	it("handles empty answer with a space text node", () => {
		const results = [makeGradingResult("q1", "1a", "")]
		const doc = buildAnnotatedDoc(results, new Map())

		const content = doc.content?.[0].content ?? []
		expect(content).toHaveLength(1)
		expect(content[0].text).toBe(" ")
	})

	it("places marks at text boundaries correctly", () => {
		const results = [makeGradingResult("q1", "1a", "hello")]
		const marks = new Map([["q1", [makeMark(0, 5, "tick")]]])
		const doc = buildAnnotatedDoc(results, marks)
		const content = doc.content?.[0].content ?? []

		// Entire text is marked
		expect(content).toHaveLength(1)
		expect(content[0].text).toBe("hello")
		expect(content[0].marks).toHaveLength(1)
		expect(content[0].marks?.[0].type).toBe("tick")
	})

	it("passes AO attrs for signal annotations with ao_category", () => {
		const results = [makeGradingResult("q1", "1a", "good analysis")]
		const aoMark: TextMark = {
			from: 0,
			to: 13,
			type: "underline",
			sentiment: "positive",
			attrs: {
				ao_category: "AO2",
				ao_display: "AO2",
				ao_quality: "strong",
				reason: "good eval",
			},
			annotationId: "a1",
		}
		const marks = new Map([["q1", [aoMark]]])
		const doc = buildAnnotatedDoc(results, marks)
		const content = doc.content?.[0].content ?? []

		expect(content[0].marks?.[0].type).toBe("annotationUnderline")
		expect(content[0].marks?.[0].attrs?.ao_category).toBe("AO2")
		expect(content[0].marks?.[0].attrs?.ao_display).toBe("AO2")
	})

	it("passes attrs for chain marks", () => {
		const results = [makeGradingResult("q1", "1a", "because of this")]
		const chainMark: TextMark = {
			from: 0,
			to: 15,
			type: "chain",
			sentiment: "neutral",
			attrs: {
				chainType: "evaluation",
				phrase: "because",
			},
			annotationId: "a1",
		}
		const marks = new Map([["q1", [chainMark]]])
		const doc = buildAnnotatedDoc(results, marks)
		const content = doc.content?.[0].content ?? []

		expect(content[0].marks?.[0].type).toBe("chain")
		expect(content[0].marks?.[0].attrs?.chainType).toBe("evaluation")
		expect(content[0].marks?.[0].attrs?.phrase).toBe("because")
	})
})

import { describe, expect, it } from "vitest"
import type { OcrMcqSelection } from "../../src/lib/scan-extraction/gemini-ocr"
import type { ReconstructedAnswer } from "../../src/lib/scan-extraction/reconstruct-answers"
import { resolveMcqAnswers } from "../../src/lib/scan-extraction/resolve-mcq-answers"
import type { QuestionSeed } from "../../src/lib/types"

function mcqSeed(id: string, number: string): QuestionSeed {
	return {
		question_id: id,
		question_number: number,
		question_text: "",
		question_type: "multiple_choice",
	}
}

function writtenSeed(id: string, number: string): QuestionSeed {
	return {
		question_id: id,
		question_number: number,
		question_text: "",
		question_type: "written",
	}
}

function mcqSel(
	question_number: string,
	selected_labels: string[],
): OcrMcqSelection {
	return { question_number, selected_labels, mark_description: "" }
}

describe("resolveMcqAnswers", () => {
	it("overrides MCQ answer text from single-page OCR selection", () => {
		const seeds = [mcqSeed("q1", "01.1")]
		const base: ReconstructedAnswer[] = [
			{ question_id: "q1", answer_text: "D" },
		]
		const ocr = [[mcqSel("01.1", ["C"])]]

		const result = resolveMcqAnswers({
			baseAnswers: base,
			ocrSelectionsByPage: ocr,
			questionSeeds: seeds,
		})

		expect(result).toEqual([{ question_id: "q1", answer_text: "C" }])
	})

	it("falls back to token-reconstructed text when OCR has no MCQ entry", () => {
		// Protects the handwritten-letter case: if token attribution picked up
		// "B" but OCR missed the MCQ, we must not wipe the answer.
		const seeds = [mcqSeed("q1", "01.1")]
		const base: ReconstructedAnswer[] = [
			{ question_id: "q1", answer_text: "B" },
		]

		const result = resolveMcqAnswers({
			baseAnswers: base,
			ocrSelectionsByPage: [[], []],
			questionSeeds: seeds,
		})

		expect(result).toEqual([{ question_id: "q1", answer_text: "B" }])
	})

	it("leaves empty answer_text empty when OCR has nothing and tokens had nothing", () => {
		const seeds = [mcqSeed("q1", "01.1")]
		const base: ReconstructedAnswer[] = [{ question_id: "q1", answer_text: "" }]

		const result = resolveMcqAnswers({
			baseAnswers: base,
			ocrSelectionsByPage: [[]],
			questionSeeds: seeds,
		})

		expect(result).toEqual([{ question_id: "q1", answer_text: "" }])
	})

	it("uses the last non-empty selection when the same MCQ appears on multiple pages", () => {
		const seeds = [mcqSeed("q1", "01.1")]
		const base: ReconstructedAnswer[] = [{ question_id: "q1", answer_text: "" }]
		const ocr = [[mcqSel("01.1", ["A"])], [mcqSel("01.1", ["B"])]]

		const result = resolveMcqAnswers({
			baseAnswers: base,
			ocrSelectionsByPage: ocr,
			questionSeeds: seeds,
		})

		expect(result).toEqual([{ question_id: "q1", answer_text: "B" }])
	})

	it("ignores empty selected_labels entries (does not clear a later page's choice)", () => {
		const seeds = [mcqSeed("q1", "01.1")]
		const base: ReconstructedAnswer[] = [{ question_id: "q1", answer_text: "" }]
		const ocr = [[mcqSel("01.1", ["C"])], [mcqSel("01.1", [])]]

		const result = resolveMcqAnswers({
			baseAnswers: base,
			ocrSelectionsByPage: ocr,
			questionSeeds: seeds,
		})

		expect(result).toEqual([{ question_id: "q1", answer_text: "C" }])
	})

	it("leaves non-MCQ answers untouched", () => {
		const seeds = [mcqSeed("q1", "01.1"), writtenSeed("q2", "02")]
		const base: ReconstructedAnswer[] = [
			{ question_id: "q1", answer_text: "D" },
			{ question_id: "q2", answer_text: "Because the demand curve shifts." },
		]
		const ocr = [[mcqSel("01.1", ["C"])]]

		const result = resolveMcqAnswers({
			baseAnswers: base,
			ocrSelectionsByPage: ocr,
			questionSeeds: seeds,
		})

		expect(result).toEqual([
			{ question_id: "q1", answer_text: "C" },
			{ question_id: "q2", answer_text: "Because the demand curve shifts." },
		])
	})

	it("joins multi-label selections (multi-select MCQ) into a single string", () => {
		const seeds = [mcqSeed("q1", "01.1")]
		const base: ReconstructedAnswer[] = [{ question_id: "q1", answer_text: "" }]
		const ocr = [[mcqSel("01.1", ["A", "C"])]]

		const result = resolveMcqAnswers({
			baseAnswers: base,
			ocrSelectionsByPage: ocr,
			questionSeeds: seeds,
		})

		expect(result).toEqual([{ question_id: "q1", answer_text: "AC" }])
	})

	it("returns base answers unchanged when there are no MCQ seeds", () => {
		const seeds = [writtenSeed("q2", "02")]
		const base: ReconstructedAnswer[] = [
			{ question_id: "q2", answer_text: "Token text." },
		]
		const ocr = [[mcqSel("01.1", ["C"])]]

		const result = resolveMcqAnswers({
			baseAnswers: base,
			ocrSelectionsByPage: ocr,
			questionSeeds: seeds,
		})

		expect(result).toEqual(base)
	})

	it("matches question_number across format variants (Q-prefix, case)", () => {
		// Seed stores "1.1"; OCR returns "Q1.1". normalizeQuestionNumber collapses
		// both to "1.1" so the override still lands.
		const seeds = [mcqSeed("q1", "1.1")]
		const base: ReconstructedAnswer[] = [{ question_id: "q1", answer_text: "" }]
		const ocr = [[mcqSel("Q1.1", ["D"])]]

		const result = resolveMcqAnswers({
			baseAnswers: base,
			ocrSelectionsByPage: ocr,
			questionSeeds: seeds,
		})

		expect(result).toEqual([{ question_id: "q1", answer_text: "D" }])
	})
})

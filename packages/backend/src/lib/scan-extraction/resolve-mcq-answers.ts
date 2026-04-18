import { normalizeQuestionNumber } from "@/lib/grading/normalize-question-number"
import type { QuestionSeed } from "@/lib/types"
import type { OcrMcqSelection } from "./gemini-ocr"
import type { ReconstructedAnswer } from "./reconstruct-answers"

const MCQ_QUESTION_TYPE = "multiple_choice"

export type ResolveMcqAnswersInput = {
	/** Base answers produced by `attributeScript`. */
	baseAnswers: ReconstructedAnswer[]
	/** Per-page OCR MCQ selections, in page order. */
	ocrSelectionsByPage: OcrMcqSelection[][]
	/** Question metadata — used to identify which base answers are MCQs. */
	questionSeeds: QuestionSeed[]
}

/**
 * For every MCQ question where OCR identified a selection, replace the
 * attribution-authored `answer_text` with the OCR-derived labels joined
 * (e.g. ["C"] → "C", ["A","B"] → "AB"). Non-MCQ answers pass through unchanged.
 *
 * Source of truth for MCQs is OCR — it sees ticks, crosses, circles, fills,
 * and handwritten letters holistically and collapses them into
 * `selected_labels`. Attribution's text-only output cannot represent non-text marks.
 *
 * Fallback: if OCR has no selection for an MCQ (empty array, missing entry,
 * or question_number mismatch we couldn't reconcile), the attribution-authored
 * `answer_text` is preserved. This protects the handwritten-letter case if
 * OCR misses it but the holistic attribution picked it up.
 *
 * Multi-page selections: the last non-empty selection wins.
 *
 * Question numbers are compared after `normalizeQuestionNumber` to tolerate
 * superficial differences (leading "Q", whitespace, punctuation).
 *
 * Pure function. No I/O.
 */
export function resolveMcqAnswers(
	input: ResolveMcqAnswersInput,
): ReconstructedAnswer[] {
	const { baseAnswers, ocrSelectionsByPage, questionSeeds } = input

	const mcqNormalisedNumberById = new Map<string, string>()
	for (const seed of questionSeeds) {
		if (seed.question_type === MCQ_QUESTION_TYPE) {
			mcqNormalisedNumberById.set(
				seed.question_id,
				normalizeQuestionNumber(seed.question_number),
			)
		}
	}

	if (mcqNormalisedNumberById.size === 0) return baseAnswers

	// Walk pages in order; last non-empty selection per normalised question_number wins.
	const selectionsByNormalisedNumber = new Map<string, string[]>()
	for (const page of ocrSelectionsByPage) {
		for (const selection of page) {
			if (selection.selected_labels.length === 0) continue
			selectionsByNormalisedNumber.set(
				normalizeQuestionNumber(selection.question_number),
				selection.selected_labels,
			)
		}
	}

	return baseAnswers.map((answer) => {
		const normalisedNumber = mcqNormalisedNumberById.get(answer.question_id)
		if (!normalisedNumber) return answer

		const labels = selectionsByNormalisedNumber.get(normalisedNumber)
		if (!labels || labels.length === 0) return answer

		return { ...answer, answer_text: labels.join("") }
	})
}

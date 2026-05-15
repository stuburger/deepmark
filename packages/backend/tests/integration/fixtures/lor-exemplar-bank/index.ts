import { FOUR_MARK_QUESTIONS } from "./4-mark"
import { SIX_MARK_ANALYSE_QUESTIONS } from "./6-mark-analyse"
import { SIX_MARK_JUSTIFY_QUESTIONS } from "./6-mark-justify"
import { NINE_MARK_EVALUATE_QUESTIONS } from "./9-mark-evaluate"
import { TWELVE_MARK_EVALUATE_QUESTIONS } from "./12-mark-evaluate"
import type { ExemplarQuestion } from "./types"

/**
 * The complete LoR Exemplar Reference Bank.
 *
 * 17 questions × ~4 answers = ~72 exemplars spanning 4-mark Explain through
 * 12-mark Evaluate. Each answer carries a human-validated expected mark band
 * and Level. Fake-L3 / Fake-L4 entries are traps that look polished but are
 * structurally capped one Level lower — the canonical "did our marker reward
 * depth, not just surface polish?" test.
 *
 * Pulled from `DeepMark Exemplar Reference Bank.pdf` (Stuart, 2026-05).
 */
export const LOR_EXEMPLAR_BANK: ExemplarQuestion[] = [
	...FOUR_MARK_QUESTIONS,
	...SIX_MARK_JUSTIFY_QUESTIONS,
	...SIX_MARK_ANALYSE_QUESTIONS,
	...NINE_MARK_EVALUATE_QUESTIONS,
	...TWELVE_MARK_EVALUATE_QUESTIONS,
]

export { renderTemplateMarkScheme, levelBand } from "./level-templates"
export type {
	AqaLevelTemplateKey,
	ExemplarAnswer,
	ExemplarQuestion,
	ExpectedOutcome,
} from "./types"

/** Flattened (questionId, answer) pairs for one-test-per-exemplar runners. */
export function flattenedExemplars(): Array<{
	question: ExemplarQuestion
	answerId: string
	answerIndex: number
}> {
	const out: Array<{
		question: ExemplarQuestion
		answerId: string
		answerIndex: number
	}> = []
	for (const question of LOR_EXEMPLAR_BANK) {
		for (let i = 0; i < question.answers.length; i++) {
			const a = question.answers[i]
			if (!a) continue
			out.push({ question, answerId: a.id, answerIndex: i })
		}
	}
	return out
}

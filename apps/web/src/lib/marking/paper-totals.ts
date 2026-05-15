import { type SectionChoiceLike, sectionExpectedMax } from "@mcp-gcse/shared"

/**
 * Paper-total helpers.
 *
 * `total_max` on every submission view should reflect the **paper's**
 * invariant — the marks ceiling — not a derived sum across graded results
 * (which collapses under partial/failed grading and produces misleading
 * percentages like "3/3 · 100%").
 *
 * Choice-aware: a section with `choice_kind = "any_n_of"` (e.g. Edexcel
 * English Lang P1 Sec B: "Answer ONE of Q5, Q6") contributes
 * `n × max(question.points)` to the paper total, not the naive sum of all
 * alternatives. See @mcp-gcse/shared/section-choice for the policy.
 *
 * Both `submissions/queries.ts` (single submission) and `listing/queries.ts`
 * (multi-submission lists) compute the same thing from the same nested
 * shape. This module is that shape's single reader.
 */

type PointsBearingSection = SectionChoiceLike & {
	exam_section_questions: Array<{
		question: { points: number | null }
	}>
}

export function sumSectionPoints(section: PointsBearingSection): number {
	const points = section.exam_section_questions.map(
		(esq) => esq.question.points ?? 0,
	)
	return sectionExpectedMax(section, points)
}

export function sumPaperPoints(sections: PointsBearingSection[]): number {
	return sections.reduce((sum, section) => sum + sumSectionPoints(section), 0)
}

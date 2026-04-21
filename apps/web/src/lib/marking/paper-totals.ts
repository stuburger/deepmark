/**
 * Paper-total helpers.
 *
 * `total_max` on every submission view should reflect the **paper's**
 * invariant — the sum of marks across every question in the paper — not a
 * derived sum across graded results (which collapses under partial/failed
 * grading and produces misleading percentages like "3/3 · 100%").
 *
 * Both `submissions/queries.ts` (single submission) and `listing/queries.ts`
 * (multi-submission lists) compute the same thing from the same nested
 * shape. This module is that shape's single reader.
 */

type PointsBearingSection = {
	exam_section_questions: Array<{
		question: { points: number | null }
	}>
}

export function sumSectionPoints(section: PointsBearingSection): number {
	return section.exam_section_questions.reduce(
		(s, esq) => s + (esq.question.points ?? 0),
		0,
	)
}

export function sumPaperPoints(sections: PointsBearingSection[]): number {
	return sections.reduce((sum, section) => sum + sumSectionPoints(section), 0)
}

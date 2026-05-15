/**
 * Pure helpers for sections that model question choice — i.e. sections where
 * the student answers a strict subset of the printed alternatives ("Answer
 * ONE of the following", "Choose 2 from 5", etc.).
 *
 * Lives in @mcp-gcse/shared so the bundle persister (backend), the marking
 * totals (Next.js), and the eventual grading aggregator all read from a
 * single source of truth.
 *
 * ── How choice plays out across the pipeline ──────────────────────────────
 *
 * 1. The paper-bundle prompt detects "Answer ONE / Choose N" and emits
 *    section.choice on extraction.
 * 2. The persister writes choice_kind + choice_n onto ExamSection.
 * 3. Downstream consumers (totals, submission rendering, grading
 *    aggregation) load those columns and pass them to the helpers here.
 *
 * For `kind = "all"` (the default), behavior is the obvious one — every
 * question contributes to the section total.
 *
 * For `kind = "any_n_of"`, totals reflect the choice: the section's
 * expected maximum is `n × max(question.points)` (because the student can
 * earn at most one alternative's worth of marks per slot), and only the
 * top-N graded results count toward the awarded score.
 *
 * ── Ranking policy when picking included results ──────────────────────────
 *
 * Exam-board practice for any_n_of sections is "if the student attempted
 * more than n, credit the better response(s)." We model that with a
 * three-key sort on grading results:
 *
 *   1. has_answer (true beats false): a result with no extracted text
 *      can't be the chosen response, even if a stub MarkingResult exists.
 *   2. awarded_score (high beats low): the "credit the better" rule.
 *   3. max_score (high beats low): tiebreak when both alternatives scored
 *      identically — prefer the response written against the higher-stakes
 *      question. Rare in practice; sensible default.
 *
 * Caller supplies whichever shape they have; only the four discriminators
 * above are read.
 *
 * ── Why this returns { included, excluded } rather than persisting a
 *    MarkingResult.included_in_total column ─────────────────────────────────
 *
 * MarkingResult rows are projected from the Yjs doc by
 * annotation-projection.ts (the doc is the source of truth for grade
 * metadata; the projection mirrors per-question results onto the DB on
 * every snapshot). Persisting `included_in_total` would force the
 * projection layer to know about section.choice and rank results during
 * projection — coupling Yjs writes to section-aggregation logic, breaking
 * the single-writer-per-column rule.
 *
 * Deriving here keeps the projection ignorant of choice and lets the
 * ranking heuristic (length tiebreak, "credit first attempt" board
 * variants, teacher overrides) evolve without a schema change.
 *
 * FUTURE: revisit if a query needs to filter on "student answered the
 * unexpected alternative" — that becomes expensive without an indexable
 * column. At that point either denormalise via the projection or add a
 * derived materialised view; both are bigger jumps than this v1.
 */

export type SectionChoiceKind = "all" | "any_n_of"

export type SectionChoiceLike = {
	choice_kind: SectionChoiceKind
	choice_n: number | null
}

/**
 * Minimum shape `resolveSectionResults` needs from a grading result. Callers
 * pass whichever wider type they already have; only these fields are read.
 */
export type GradedAlternativeLike = {
	question_id: string
	awarded_score: number
	max_score: number
	has_answer: boolean
}

export type ResolvedSection<R extends GradedAlternativeLike> = {
	included: R[]
	excluded: R[]
}

/**
 * Partition a section's grading results into the ones that count toward the
 * paper total (included) and the ones the student didn't choose / didn't
 * answer (excluded).
 *
 * - `kind = "all"` or `n` missing: included = results, excluded = [].
 * - `kind = "any_n_of"` with valid `n`: rank by (has_answer, awarded,
 *   max_score) and keep the top `n`.
 *
 * Order within `included` matches the ranking (best first). `excluded`
 * preserves the rest of the ranking order so UI can render "and you also
 * attempted: X (would have scored Y)".
 */
export function resolveSectionResults<R extends GradedAlternativeLike>(
	section: SectionChoiceLike,
	results: R[],
): ResolvedSection<R> {
	if (section.choice_kind !== "any_n_of" || section.choice_n === null) {
		return { included: results, excluded: [] }
	}
	const ranked = [...results].sort(compareGradedAlternatives)
	return {
		included: ranked.slice(0, section.choice_n),
		excluded: ranked.slice(section.choice_n),
	}
}

function compareGradedAlternatives(
	a: GradedAlternativeLike,
	b: GradedAlternativeLike,
): number {
	if (a.has_answer !== b.has_answer) return a.has_answer ? -1 : 1
	if (a.awarded_score !== b.awarded_score) return b.awarded_score - a.awarded_score
	return b.max_score - a.max_score
}

/**
 * The marks ceiling for a section: what the student CAN earn given the
 * section's choice rule.
 *
 * - `all`: sum of every question's marks.
 * - `any_n_of(n)`: `n × max(question.points)`. The "n times max" model
 *   handles the common case (every alternative is equally weighted, which
 *   is what Pearson/AQA do). If a board ever ships unequal alternatives
 *   inside an any_n_of section, this will overstate the ceiling by the
 *   per-question delta; revisit if that turns up in a real paper.
 */
export function sectionExpectedMax(
	section: SectionChoiceLike,
	questionPoints: ReadonlyArray<number>,
): number {
	if (section.choice_kind === "any_n_of" && section.choice_n !== null) {
		if (questionPoints.length === 0) return 0
		const maxPerAlternative = Math.max(...questionPoints)
		return section.choice_n * maxPerAlternative
	}
	return questionPoints.reduce((s, p) => s + p, 0)
}

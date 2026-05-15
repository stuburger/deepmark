import type { SectionChoiceKind } from "@mcp-gcse/db"
import { resolveSectionResults } from "@mcp-gcse/shared"

/**
 * Apps-web view-layer glue between the shared `resolveSectionResults`
 * primitive (which only knows about section.choice + ranked results) and
 * the two consumers that actually render submissions: the detail flow
 * (`submissions/queries.ts`, which needs per-result `included_in_total`
 * tags so the question-answer view can render a "Not chosen" pill) and
 * the listing flow (`listing/queries.ts`, which only needs the
 * choice-aware awarded total per submission).
 *
 * Both consumers previously inlined the same loop — build a result
 * lookup, iterate sections, derive has_answer, rank, accumulate. This
 * is that loop, named once.
 *
 * ── Override handling ────────────────────────────────────────────────
 * Callers MUST pre-bake any teacher overrides into `result.awarded_score`
 * before calling. The override must participate in the ranking (a 25-mark
 * override should beat the LLM's 10-mark result), and pre-baking keeps
 * the primitive's signature minimal. See the call sites for the
 * two-line `result.awarded_score = override ?? result.awarded_score`
 * pre-pass.
 *
 * ── Sectionless ("orphan") results ────────────────────────────────────
 * A graded question that survives a paper edit and is no longer linked
 * to any section is rare but possible. We treat orphans as included so
 * we don't silently drop their marks — both `total_awarded` and the
 * tagged result carry `included_in_total = true` for them.
 */

export type GradingResultLike = {
	question_id: string
	awarded_score: number
	max_score: number
	student_answer: string
}

export type ChoiceAwareSection = {
	choice_kind: SectionChoiceKind
	choice_n: number | null
	question_ids: string[]
}

export type PartitionInput<R extends GradingResultLike> = {
	sections: ChoiceAwareSection[]
	/** Results with any teacher overrides already applied to awarded_score. */
	results: R[]
}

export type PartitionOutput<R extends GradingResultLike> = {
	/** Sum of awarded_score across included (sectioned) + orphan results. */
	totalAwarded: number
	/** Question IDs of the chosen alternatives in any_n_of sections + every
	 *  question in an `all` section. Exposed for callers that want a quick
	 *  membership test without re-iterating the tagged results. */
	includedIds: Set<string>
	/** Original results in the same order, each tagged with included_in_total. */
	results: Array<R & { included_in_total: boolean }>
}

export function partitionResultsByChoice<R extends GradingResultLike>({
	sections,
	results,
}: PartitionInput<R>): PartitionOutput<R> {
	const resultByQuestion = new Map(results.map((r) => [r.question_id, r]))
	const sectionedQuestions = new Set<string>()
	const includedIds = new Set<string>()

	for (const section of sections) {
		for (const qid of section.question_ids) sectionedQuestions.add(qid)
		const sectionResults = section.question_ids
			.map((qid) => resultByQuestion.get(qid))
			.filter((r): r is R => r !== undefined)
		if (sectionResults.length === 0) continue

		const annotated = sectionResults.map((r) => ({
			...r,
			has_answer: r.student_answer.trim().length > 0,
		}))
		const { included } = resolveSectionResults(section, annotated)
		for (const r of included) includedIds.add(r.question_id)
	}

	let totalAwarded = 0
	const tagged = results.map((r) => {
		const isSectioned = sectionedQuestions.has(r.question_id)
		const included = !isSectioned || includedIds.has(r.question_id)
		if (included) totalAwarded += r.awarded_score
		return { ...r, included_in_total: included }
	})

	return { totalAwarded, includedIds, results: tagged }
}

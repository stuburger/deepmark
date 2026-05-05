import type { GradingResult, MarkPointResult } from "@mcp-gcse/shared"

/**
 * Pure diff helper for the Yjs → (Answer + MarkingResult) projection. Given
 * the rows currently in the DB for a submission and the grading results
 * derived from the latest Yjs snapshot, returns the minimal set of
 * inserts / updates / deletes the projection Lambda needs to issue.
 *
 * Identity is `(submission_id, question_id)` — at most one Answer per
 * (submission, question), enforced by `@@unique([submission_id, question_id])`
 * on the schema. Each Answer has at most one MarkingResult (1:1 logical
 * pairing — the projection rebuilds this on every snapshot, so we never
 * keep stale historical MarkingResult rows. Yjs is the temporal log).
 *
 * Rows whose `mark_scheme_id` is null in the derived input are skipped
 * entirely — the schema requires a non-null mark scheme on MarkingResult,
 * and writing an orphan Answer would defeat the 1:1 invariant. Questions
 * graded without a mark scheme are visible only via the doc.
 */

export type DesiredRow = {
	question_id: string
	mark_scheme_id: string
	student_answer: string
	awarded_score: number
	max_score: number
	mark_points_results: MarkPointResult[]
	feedback_summary: string
	llm_reasoning: string
	level_awarded: number | null
	why_not_next_level: string | null
	cap_applied: string | null
}

export type ExistingRow = {
	answer_id: string
	marking_result_id: string | null
	question_id: string
	mark_scheme_id: string | null
	student_answer: string
	total_score: number | null
	max_possible_score: number
	mark_points_results: MarkPointResult[]
	feedback_summary: string
	llm_reasoning: string
	level_awarded: number | null
	why_not_next_level: string | null
	cap_applied: string | null
}

export type DiffPlan = {
	inserts: DesiredRow[]
	updates: Array<{
		answer_id: string
		marking_result_id: string | null
		row: DesiredRow
	}>
	deleteAnswerIds: string[]
}

/**
 * Translate `GradingResult[]` (output of `deriveGradingResultsFromDoc`)
 * into the projection's row shape, dropping rows that can't be projected
 * (no `mark_scheme_id`).
 */
export function buildDesiredRows(derived: GradingResult[]): DesiredRow[] {
	const out: DesiredRow[] = []
	for (const r of derived) {
		if (!r.mark_scheme_id) continue
		out.push({
			question_id: r.question_id,
			mark_scheme_id: r.mark_scheme_id,
			student_answer: r.student_answer,
			awarded_score: r.awarded_score,
			max_score: r.max_score,
			mark_points_results: r.mark_points_results ?? [],
			feedback_summary: r.feedback_summary,
			llm_reasoning: r.llm_reasoning,
			level_awarded: r.level_awarded ?? null,
			why_not_next_level: r.why_not_next_level ?? null,
			cap_applied: r.cap_applied ?? null,
		})
	}
	return out
}

export function diffMarkingResults(
	existing: ExistingRow[],
	desired: DesiredRow[],
): DiffPlan {
	const existingByQuestion = new Map(existing.map((e) => [e.question_id, e]))
	const desiredByQuestion = new Map(desired.map((d) => [d.question_id, d]))

	const inserts: DesiredRow[] = []
	const updates: DiffPlan["updates"] = []
	const deleteAnswerIds: string[] = []

	for (const d of desired) {
		const e = existingByQuestion.get(d.question_id)
		if (!e) {
			inserts.push(d)
			continue
		}
		if (!rowsEqual(e, d)) {
			updates.push({
				answer_id: e.answer_id,
				marking_result_id: e.marking_result_id,
				row: d,
			})
		}
	}
	for (const e of existing) {
		if (!desiredByQuestion.has(e.question_id)) deleteAnswerIds.push(e.answer_id)
	}

	return { inserts, updates, deleteAnswerIds }
}

function rowsEqual(e: ExistingRow, d: DesiredRow): boolean {
	return (
		e.mark_scheme_id === d.mark_scheme_id &&
		e.student_answer === d.student_answer &&
		e.total_score === d.awarded_score &&
		e.max_possible_score === d.max_score &&
		e.feedback_summary === d.feedback_summary &&
		e.llm_reasoning === d.llm_reasoning &&
		e.level_awarded === d.level_awarded &&
		e.why_not_next_level === d.why_not_next_level &&
		e.cap_applied === d.cap_applied &&
		canonicalJson(e.mark_points_results) ===
			canonicalJson(d.mark_points_results)
	)
}

/**
 * Stringify with keys sorted recursively. PG jsonb storage normalises key
 * order on write, so a row read back from Prisma may have a different key
 * order than the JS object that produced it. Compare canonical forms.
 */
function canonicalJson(value: unknown): string {
	return JSON.stringify(value, (_key, v) => {
		if (v && typeof v === "object" && !Array.isArray(v)) {
			const entries = Object.entries(v as Record<string, unknown>).sort(
				([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
			)
			const sorted: Record<string, unknown> = {}
			for (const [k, val] of entries) sorted[k] = val
			return sorted
		}
		return v
	})
}

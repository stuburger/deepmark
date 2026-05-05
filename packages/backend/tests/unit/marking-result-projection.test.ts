import type { GradingResult, MarkPointResult } from "@mcp-gcse/shared"
import { describe, expect, it } from "vitest"
import {
	type DesiredRow,
	type ExistingRow,
	buildDesiredRows,
	diffMarkingResults,
} from "../../src/lib/grading/marking-result-projection"

/**
 * Pure-function tests for the marking-result projection diff. The whole
 * "single writer cannot drift" claim depends on this helper producing a
 * stable, minimal set of operations from `(existingRows, desiredRows)`.
 *
 * Cases pinned here:
 * - Insert: derived has new questions that don't exist yet.
 * - Update: same question, different payload — rewrite, no duplicate row.
 * - Delete-orphan: doc no longer mentions a question — drop the row.
 * - No-op: identical input/output produces zero ops.
 * - Empty-derived: doc has no graded questions — drop everything.
 * - mark_scheme_id null: row is skipped at buildDesiredRows boundary so
 *   it can never reach the diff.
 *
 * No DB. The wrapper that turns a DiffPlan into Prisma calls is tested
 * separately by the integration suite.
 */
describe("marking-result-projection", () => {
	describe("buildDesiredRows", () => {
		it("strips rows with null mark_scheme_id (deterministic-no-MS)", () => {
			const derived: GradingResult[] = [
				gradingResult({ question_id: "q1", mark_scheme_id: "ms1" }),
				gradingResult({ question_id: "q2", mark_scheme_id: null }),
				gradingResult({ question_id: "q3", mark_scheme_id: "ms3" }),
			]
			const out = buildDesiredRows(derived)
			expect(out).toHaveLength(2)
			expect(out.map((r) => r.question_id)).toEqual(["q1", "q3"])
		})

		it("preserves field-level data including mark_points_results", () => {
			const mps: MarkPointResult[] = [
				{
					pointNumber: 1,
					awarded: true,
					reasoning: "ok",
					expectedCriteria: "x",
					studentCovered: "y",
				},
			]
			const out = buildDesiredRows([
				gradingResult({
					question_id: "q1",
					mark_scheme_id: "ms1",
					awarded_score: 3,
					max_score: 4,
					mark_points_results: mps,
					feedback_summary: "good work",
					level_awarded: 2,
					why_not_next_level: "needs detail",
					cap_applied: "AO1 cap",
				}),
			])
			expect(out[0]).toEqual({
				question_id: "q1",
				mark_scheme_id: "ms1",
				student_answer: "ans",
				awarded_score: 3,
				max_score: 4,
				mark_points_results: mps,
				feedback_summary: "good work",
				llm_reasoning: "",
				level_awarded: 2,
				why_not_next_level: "needs detail",
				cap_applied: "AO1 cap",
			})
		})
	})

	describe("diffMarkingResults", () => {
		it("inserts when desired has new questions", () => {
			const plan = diffMarkingResults(
				[],
				[desiredRow({ question_id: "q1" }), desiredRow({ question_id: "q2" })],
			)
			expect(plan.inserts).toHaveLength(2)
			expect(plan.updates).toHaveLength(0)
			expect(plan.deleteAnswerIds).toHaveLength(0)
		})

		it("updates when same question has changed score", () => {
			const plan = diffMarkingResults(
				[
					existingRow({
						answer_id: "a1",
						marking_result_id: "mr1",
						question_id: "q1",
						total_score: 2,
					}),
				],
				[desiredRow({ question_id: "q1", awarded_score: 3 })],
			)
			expect(plan.inserts).toHaveLength(0)
			expect(plan.updates).toHaveLength(1)
			expect(plan.updates[0]).toMatchObject({
				answer_id: "a1",
				marking_result_id: "mr1",
				row: { awarded_score: 3 },
			})
			expect(plan.deleteAnswerIds).toHaveLength(0)
		})

		it("updates when feedback summary changes", () => {
			const plan = diffMarkingResults(
				[
					existingRow({
						answer_id: "a1",
						marking_result_id: "mr1",
						question_id: "q1",
						feedback_summary: "old",
					}),
				],
				[desiredRow({ question_id: "q1", feedback_summary: "new" })],
			)
			expect(plan.updates).toHaveLength(1)
		})

		it("updates when mark_points_results jsonb differs (canonicalised)", () => {
			const a: MarkPointResult = {
				pointNumber: 1,
				awarded: true,
				reasoning: "x",
				expectedCriteria: "c",
				studentCovered: "s",
			}
			const b: MarkPointResult = { ...a, awarded: false }
			const plan = diffMarkingResults(
				[
					existingRow({
						answer_id: "a1",
						marking_result_id: "mr1",
						question_id: "q1",
						mark_points_results: [a],
					}),
				],
				[desiredRow({ question_id: "q1", mark_points_results: [b] })],
			)
			expect(plan.updates).toHaveLength(1)
		})

		it("deletes orphan when doc no longer mentions question", () => {
			const plan = diffMarkingResults(
				[
					existingRow({ answer_id: "a1", question_id: "q1" }),
					existingRow({ answer_id: "a2", question_id: "q2" }),
				],
				[desiredRow({ question_id: "q1" })],
			)
			expect(plan.inserts).toHaveLength(0)
			expect(plan.updates).toHaveLength(0)
			expect(plan.deleteAnswerIds).toEqual(["a2"])
		})

		it("no-op when existing and desired are field-identical", () => {
			const args = {
				question_id: "q1",
				mark_scheme_id: "ms1",
				student_answer: "ans",
				awarded_score: 2,
				max_score: 4,
				feedback_summary: "ok",
				llm_reasoning: "ok",
				level_awarded: null,
				why_not_next_level: null,
				cap_applied: null,
				mark_points_results: [] as MarkPointResult[],
			}
			const plan = diffMarkingResults(
				[
					{
						answer_id: "a1",
						marking_result_id: "mr1",
						total_score: args.awarded_score,
						max_possible_score: args.max_score,
						...args,
					},
				],
				[args],
			)
			expect(plan.inserts).toHaveLength(0)
			expect(plan.updates).toHaveLength(0)
			expect(plan.deleteAnswerIds).toHaveLength(0)
		})

		it("empty desired drops every existing row", () => {
			const plan = diffMarkingResults(
				[
					existingRow({ answer_id: "a1", question_id: "q1" }),
					existingRow({ answer_id: "a2", question_id: "q2" }),
				],
				[],
			)
			expect(plan.inserts).toHaveLength(0)
			expect(plan.updates).toHaveLength(0)
			expect(plan.deleteAnswerIds).toEqual(["a1", "a2"])
		})

		it("handles the existing-answer-without-marking-result case as update", () => {
			// Edge: an Answer row exists with no MarkingResult attached. The diff
			// should mark it as an update so the Lambda creates the missing half.
			const plan = diffMarkingResults(
				[
					existingRow({
						answer_id: "a1",
						marking_result_id: null,
						question_id: "q1",
						mark_scheme_id: null,
					}),
				],
				[desiredRow({ question_id: "q1", mark_scheme_id: "ms1" })],
			)
			expect(plan.updates).toHaveLength(1)
			expect(plan.updates[0]?.marking_result_id).toBeNull()
		})
	})
})

// ─── Test helpers ──────────────────────────────────────────────────────────

function gradingResult(over: Partial<GradingResult> = {}): GradingResult {
	return {
		question_id: "q1",
		question_text: "What is 2+2?",
		question_number: "1",
		student_answer: "ans",
		awarded_score: 0,
		max_score: 1,
		llm_reasoning: "",
		feedback_summary: "",
		marking_method: "point_based",
		mark_scheme_id: "ms1",
		...over,
	}
}

function desiredRow(over: Partial<DesiredRow> = {}): DesiredRow {
	return {
		question_id: "q1",
		mark_scheme_id: "ms1",
		student_answer: "ans",
		awarded_score: 1,
		max_score: 4,
		mark_points_results: [],
		feedback_summary: "",
		llm_reasoning: "",
		level_awarded: null,
		why_not_next_level: null,
		cap_applied: null,
		...over,
	}
}

function existingRow(over: Partial<ExistingRow> = {}): ExistingRow {
	return {
		answer_id: "a1",
		marking_result_id: "mr1",
		question_id: "q1",
		mark_scheme_id: "ms1",
		student_answer: "ans",
		total_score: 1,
		max_possible_score: 4,
		mark_points_results: [],
		feedback_summary: "",
		llm_reasoning: "",
		level_awarded: null,
		why_not_next_level: null,
		cap_applied: null,
		...over,
	}
}

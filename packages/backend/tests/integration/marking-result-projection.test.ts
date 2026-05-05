import {
	TEST_EXAM_PAPER_ID,
	TEST_USER_ID,
	db,
	ensureExamPaper,
} from "@mcp-gcse/test-utils"
import type { GradingResult } from "@mcp-gcse/shared"
import { randomUUID } from "node:crypto"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { writeMarkingResults } from "../../src/processors/annotation-projection"

/**
 * Load-bearing integration test for the "single writer, idempotent" claim
 * the build plan rests on. The whole architectural premise is that
 * re-running the projection on the same Yjs-derived input produces the
 * same Answer + MarkingResult rows — no churn, no duplicates, no drift.
 *
 * Without this test the diff helper unit test is just structural: it
 * proves the planner returns a no-op DiffPlan, but doesn't prove the DB
 * stays stable when that plan is applied.
 *
 * Hits a real DB via the existing test-utils harness. Run via:
 *   AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- \
 *     bunx vitest run --project backend:integration tests/integration/marking-result-projection.test.ts
 */

// Fixture question + mark-scheme pairs (from exam-paper-abc.json — seeded by ensureExamPaper)
const Q1 = {
	question_id: "cmnajs6x300009ww3k1ts29ht",
	mark_scheme_id: "cmnajtu4f0000mqw33l6d28mx",
	question_number: "1.1",
}
const Q2 = {
	question_id: "cmnajs7ar00019ww3ta0ofa9e",
	mark_scheme_id: "cmnajtu6c0001mqw34zxpbeid",
	question_number: "1.2",
}
const Q3 = {
	question_id: "cmnajs7j100029ww36q9l90wi",
	mark_scheme_id: "cmnajtu8a0002mqw3tadol3le",
	question_number: "1.3",
}

beforeAll(async () => {
	await ensureExamPaper()
})

describe("writeMarkingResults projection", () => {
	let submissionId: string

	afterEach(async () => {
		if (!submissionId) return
		// Tear down in FK-correct order — marking_results → answers → submission.
		await db.markingResult.deleteMany({
			where: { answer: { is: { submission_id: submissionId } } },
		})
		await db.answer.deleteMany({ where: { submission_id: submissionId } })
		await db.studentSubmission.deleteMany({ where: { id: submissionId } })
	})

	async function createSubmission(): Promise<string> {
		const sub = await db.studentSubmission.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				s3_key: `test/marking-result-projection/${randomUUID()}`,
				s3_bucket: "test-bucket",
				exam_board: "AQA",
				pages: [],
			},
			select: { id: true },
		})
		return sub.id
	}

	it("writes Answer + MarkingResult rows on first projection", async () => {
		submissionId = await createSubmission()

		await writeMarkingResults(submissionId, [
			gradingResult(Q1, { awarded_score: 1, feedback_summary: "Correct option C." }),
			gradingResult(Q2, { awarded_score: 0, feedback_summary: "Wrong choice." }),
		])

		const answers = await db.answer.findMany({
			where: { submission_id: submissionId },
			include: { marking_results: true },
			orderBy: { question_id: "asc" },
		})
		expect(answers).toHaveLength(2)
		expect(answers.every((a) => a.marking_results.length === 1)).toBe(true)
		expect(answers.map((a) => a.total_score).sort()).toEqual([0, 1])
	})

	it("is idempotent — re-running with the same input does not churn rows", async () => {
		submissionId = await createSubmission()

		const results = [
			gradingResult(Q1, { awarded_score: 1 }),
			gradingResult(Q2, { awarded_score: 1 }),
		]

		await writeMarkingResults(submissionId, results)
		const before = await db.answer.findMany({
			where: { submission_id: submissionId },
			include: { marking_results: { select: { id: true, marked_at: true } } },
			orderBy: { question_id: "asc" },
		})

		// Second pass with identical input. The diff helper should return
		// an all-no-op plan. Existing rows must not be deleted+recreated.
		await writeMarkingResults(submissionId, results)
		const after = await db.answer.findMany({
			where: { submission_id: submissionId },
			include: { marking_results: { select: { id: true, marked_at: true } } },
			orderBy: { question_id: "asc" },
		})

		expect(after).toHaveLength(before.length)
		// Stable Answer ids — proves no delete-and-reinsert happened
		expect(after.map((a) => a.id)).toEqual(before.map((a) => a.id))
		// Stable submitted_at proves no Answer row was recreated
		expect(after.map((a) => a.submitted_at.getTime())).toEqual(
			before.map((a) => a.submitted_at.getTime()),
		)
		// Stable MarkingResult ids
		expect(after.map((a) => a.marking_results[0]?.id)).toEqual(
			before.map((a) => a.marking_results[0]?.id),
		)
		// Stable marked_at — confirms the row was untouched, not just upserted
		expect(after.map((a) => a.marking_results[0]?.marked_at.getTime())).toEqual(
			before.map((a) => a.marking_results[0]?.marked_at.getTime()),
		)
	})

	it("updates score in place when awarded_score changes — same row, new value", async () => {
		submissionId = await createSubmission()

		await writeMarkingResults(submissionId, [
			gradingResult(Q1, { awarded_score: 0 }),
		])
		const before = await db.answer.findFirstOrThrow({
			where: { submission_id: submissionId, question_id: Q1.question_id },
			select: { id: true, marking_results: { select: { id: true } } },
		})

		await writeMarkingResults(submissionId, [
			gradingResult(Q1, { awarded_score: 1, feedback_summary: "Now correct." }),
		])
		const after = await db.answer.findFirstOrThrow({
			where: { submission_id: submissionId, question_id: Q1.question_id },
			include: { marking_results: true },
		})

		// Same row identity — proves it was an update, not a delete+insert
		expect(after.id).toBe(before.id)
		expect(after.marking_results[0]?.id).toBe(before.marking_results[0]?.id)
		// New values
		expect(after.total_score).toBe(1)
		expect(after.marking_results[0]?.feedback_summary).toBe("Now correct.")
		expect(after.marking_results[0]?.total_score).toBe(1)
	})

	it("deletes orphan rows when the doc no longer mentions a question", async () => {
		submissionId = await createSubmission()

		await writeMarkingResults(submissionId, [
			gradingResult(Q1, { awarded_score: 1 }),
			gradingResult(Q2, { awarded_score: 1 }),
			gradingResult(Q3, { awarded_score: 1 }),
		])
		expect(
			await db.answer.count({ where: { submission_id: submissionId } }),
		).toBe(3)

		// Q3 disappears — e.g. teacher removed that question's grade in the doc
		await writeMarkingResults(submissionId, [
			gradingResult(Q1, { awarded_score: 1 }),
			gradingResult(Q2, { awarded_score: 1 }),
		])

		const remaining = await db.answer.findMany({
			where: { submission_id: submissionId },
			select: { question_id: true },
			orderBy: { question_id: "asc" },
		})
		expect(remaining.map((a) => a.question_id).sort()).toEqual(
			[Q1.question_id, Q2.question_id].sort(),
		)
		// And the orphaned MarkingResult is gone too
		const allMr = await db.markingResult.count({
			where: { answer: { submission_id: submissionId } },
		})
		expect(allMr).toBe(2)
	})

	it("skips rows with null mark_scheme_id (no orphan Answer)", async () => {
		submissionId = await createSubmission()

		await writeMarkingResults(submissionId, [
			gradingResult(Q1, { awarded_score: 1 }),
			gradingResult(Q2, { awarded_score: 1, mark_scheme_id: null }),
		])

		const answers = await db.answer.findMany({
			where: { submission_id: submissionId },
		})
		expect(answers).toHaveLength(1)
		expect(answers[0]?.question_id).toBe(Q1.question_id)
	})
})

// ─── Test helpers ──────────────────────────────────────────────────────────

function gradingResult(
	q: { question_id: string; mark_scheme_id: string; question_number: string },
	over: Partial<GradingResult> & { mark_scheme_id?: string | null } = {},
): GradingResult {
	return {
		question_id: q.question_id,
		question_number: q.question_number,
		question_text: "fixture question",
		student_answer: "C",
		awarded_score: 0,
		max_score: 1,
		llm_reasoning: "test",
		feedback_summary: "test feedback",
		marking_method: "deterministic",
		mark_scheme_id: q.mark_scheme_id,
		mark_points_results: [],
		level_awarded: undefined,
		why_not_next_level: null,
		cap_applied: null,
		...over,
	}
}

import {
	TEST_EXAM_PAPER_ID,
	TEST_USER_ID,
	db,
	ensureExamPaper,
} from "@mcp-gcse/test-utils"
import { randomUUID } from "node:crypto"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { markAnswerById } from "../../src/services/mark-answer"

/**
 * Smoke test for the markAnswerById MCP write path after the FK move from
 * `Answer.student_id` to `Answer.submission_id`. The eval/MCP entry point
 * runs OUTSIDE the doc/Yjs flow (its tool surface lets a client mark a
 * single answer ad hoc), so this is the one path the projection Lambda
 * doesn't cover. If the schema chain — Answer → Question (+ stimuli) +
 * MarkScheme lookup — breaks at runtime, this is where we'd notice.
 *
 * Asserts the relation chain resolves; does not exercise the LLM call.
 * The early-return-on-already-completed branch in `markAnswerById` is the
 * cheapest way to prove "loadAnswer succeeds against the new schema"
 * without burning real LLM budget.
 */

const Q1 = {
	question_id: "cmnajs6x300009ww3k1ts29ht",
}

beforeAll(async () => {
	await ensureExamPaper()
})

describe("markAnswerById schema chain", () => {
	let submissionId: string
	let answerId: string

	afterEach(async () => {
		await db.markingResult
			.deleteMany({ where: { answer_id: answerId } })
			.catch(() => {})
		if (answerId) {
			await db.answer.deleteMany({ where: { id: answerId } }).catch(() => {})
		}
		if (submissionId) {
			await db.studentSubmission
				.deleteMany({ where: { id: submissionId } })
				.catch(() => {})
		}
	})

	it("loadAnswer resolves through submission, not student", async () => {
		// Seed a submission + Answer keyed on submission_id (the new FK).
		const sub = await db.studentSubmission.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				s3_key: `test/mark-answer/${randomUUID()}`,
				s3_bucket: "test-bucket",
				exam_board: "AQA",
				pages: [],
			},
		})
		submissionId = sub.id

		const answer = await db.answer.create({
			data: {
				submission_id: sub.id,
				question_id: Q1.question_id,
				student_answer: "C",
				max_possible_score: 1,
				total_score: 1,
				marking_status: "completed", // takes the early-return path
				marked_at: new Date(),
			},
		})
		answerId = answer.id

		// The chain we care about: findUniqueOrThrow with include: { question: ... }.
		// If the FK move had broken anything (e.g. an unresolved Student join), this
		// throws before the early-return.
		const result = await markAnswerById(answer.id)

		expect(result.marked).toBe(false)
		expect(result.total_score).toBe(1)
		expect(result.max_possible_score).toBe(1)
	})
})

import { randomUUID } from "node:crypto"
import { TEST_EXAM_PAPER_ID, db, ensureExamPaper } from "@mcp-gcse/test-utils"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

const { insertConsumesForBatch } = await import("../../src/lib/billing/ledger")
const { InsufficientBalanceError } = await import("../../src/lib/billing/types")

beforeAll(async () => {
	await ensureExamPaper()
})

/**
 * The reserve-on-submit consume insert (commit-service / re-mark / re-scan)
 * was claimed to close the over-spend race in the build plan, citing
 * "Postgres serialisation on the unique index". That claim is wrong: the
 * unique index is on `(kind, grading_run_id)`, and parallel batches use
 * disjoint grading_run_ids — they never collide.
 *
 * The actual race:
 *   1. assertPapersQuota fires outside any lock; both parallel batches see
 *      the same balance and both pass their pre-check.
 *   2. Each batch's tx writes its consume rows independently, with no
 *      balance check at write time.
 *   3. Final balance can go below zero.
 *
 * The fix lives inside `insertConsumesForBatch` (web wrapper around the
 * shared `insertConsumesForGradingRuns`): take a per-user
 * `pg_advisory_xact_lock`, re-read the balance, throw
 * `InsufficientBalanceError` if it can no longer cover the request. The
 * lock auto-releases at COMMIT/ROLLBACK so it's scoped strictly to the
 * consume tx.
 *
 * This test would pass *trivially* if there were no bug, so it was authored
 * against the unfixed code first to confirm it failed (balance went to -1)
 * before the lock was added.
 */
describe("paper_ledger over-spend race", () => {
	const userIds: string[] = []

	afterEach(async () => {
		for (const userId of userIds) {
			await db.paperLedgerEntry.deleteMany({ where: { user_id: userId } })
			const subs = await db.studentSubmission.findMany({
				where: { uploaded_by: userId },
				select: { id: true },
			})
			const subIds = subs.map((s) => s.id)
			if (subIds.length > 0) {
				await db.gradingRun.deleteMany({
					where: { submission_id: { in: subIds } },
				})
				await db.ocrRun.deleteMany({
					where: { submission_id: { in: subIds } },
				})
			}
			await db.studentSubmission.deleteMany({
				where: { uploaded_by: userId },
			})
			await db.user.delete({ where: { id: userId } }).catch(() => {})
		}
		userIds.length = 0
	})

	async function seedUser(initialBalance: number): Promise<string> {
		const userId = randomUUID()
		userIds.push(userId)
		await db.user.create({
			data: {
				id: userId,
				email: `over-spend-${userId}@test`,
				name: "Over-Spend Test User",
				role: "teacher",
				is_active: true,
			},
		})
		if (initialBalance > 0) {
			await db.paperLedgerEntry.create({
				data: {
					user_id: userId,
					papers: initialBalance,
					kind: "admin_grant",
				},
			})
		}
		return userId
	}

	async function seedGradingRun(userId: string): Promise<string> {
		const id = randomUUID()
		await db.studentSubmission.create({
			data: {
				id,
				uploaded_by: userId,
				exam_paper_id: TEST_EXAM_PAPER_ID,
				exam_board: "AQA",
				subject: "biology" as never,
				year: 2024,
				pages: [],
				s3_key: "test",
				s3_bucket: "test",
			},
		})
		await db.ocrRun.create({
			data: { id, submission_id: id, status: "pending" },
		})
		await db.gradingRun.create({
			data: {
				id,
				submission_id: id,
				ocr_run_id: id,
				status: "pending",
			},
		})
		return id
	}

	it("two parallel batches sharing the same balance can't drive it negative", async () => {
		// User has exactly 3 papers; two parallel "batches" each request 2
		// (total request = 4). Without the lock-and-recheck inside
		// insertConsumesForBatch, both pre-checks pass (each tx sees balance=3),
		// both inserts commit, final balance = -1.
		const userId = await seedUser(3)
		const batchAIds = await Promise.all([
			seedGradingRun(userId),
			seedGradingRun(userId),
		])
		const batchBIds = await Promise.all([
			seedGradingRun(userId),
			seedGradingRun(userId),
		])

		async function attempt(gradingRunIds: string[]): Promise<void> {
			await db.$transaction(async (tx) => {
				await insertConsumesForBatch({
					userId,
					gradingRunIds,
					periodId: null,
					plan: null,
					tx,
				})
			})
		}

		const [resultA, resultB] = await Promise.allSettled([
			attempt(batchAIds),
			attempt(batchBIds),
		])

		// Whatever order the lock resolves, the balance must never be negative.
		const balanceAgg = await db.paperLedgerEntry.aggregate({
			where: { user_id: userId },
			_sum: { papers: true },
		})
		const finalBalance = balanceAgg._sum.papers ?? 0
		expect(finalBalance).toBeGreaterThanOrEqual(0)

		// Exactly one batch should have succeeded; the other gets
		// InsufficientBalanceError after acquiring the lock and re-checking.
		const succeeded = [resultA, resultB].filter((r) => r.status === "fulfilled")
		const failed = [resultA, resultB].filter((r) => r.status === "rejected")
		expect(succeeded).toHaveLength(1)
		expect(failed).toHaveLength(1)
		expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(
			InsufficientBalanceError,
		)
	})

	it("parallel batches that collectively fit are both allowed", async () => {
		// Sanity check the lock doesn't reject when there's headroom for both
		// batches (4 papers, two batches of 2 each).
		const userId = await seedUser(4)
		const batchAIds = await Promise.all([
			seedGradingRun(userId),
			seedGradingRun(userId),
		])
		const batchBIds = await Promise.all([
			seedGradingRun(userId),
			seedGradingRun(userId),
		])

		async function attempt(gradingRunIds: string[]): Promise<void> {
			await db.$transaction(async (tx) => {
				await insertConsumesForBatch({
					userId,
					gradingRunIds,
					periodId: null,
					plan: null,
					tx,
				})
			})
		}

		const results = await Promise.allSettled([
			attempt(batchAIds),
			attempt(batchBIds),
		])
		expect(results.every((r) => r.status === "fulfilled")).toBe(true)

		const balanceAgg = await db.paperLedgerEntry.aggregate({
			where: { user_id: userId },
			_sum: { papers: true },
		})
		expect(balanceAgg._sum.papers).toBe(0)
	})
})

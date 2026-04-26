import type { GradingStatus } from "@mcp-gcse/db"
import { describe, expect, it } from "vitest"
import {
	type GradingRunStore,
	STALE_PROCESSING_MS,
	claimGradingRun,
} from "../../src/lib/grading/claim-grading-run"

/**
 * `claimGradingRun` is the load-bearing piece preventing two grade
 * Lambdas from concurrently writing to the same Y.Doc and producing
 * duplicate question blocks. These tests pin the contract:
 *
 * - Cold start (no row) → claim succeeds (creates row).
 * - Concurrent cold start losing the create race → claim fails with
 *   `already_processing` (P2002 path).
 * - Row in `pending`/`failed`/`cancelled` → claim succeeds (takes over).
 * - Row in `processing` within stale window → claim fails.
 * - Row in `processing` past stale window → claim succeeds (takeover).
 * - Row in `complete` → claim fails with `already_complete`.
 *
 * No DB. The store is an in-memory object that mirrors the relevant
 * subset of Prisma's API.
 */

type GradingRunRow = {
	id: string
	status: GradingStatus
	started_at: Date
}

function makeStore(seed?: GradingRunRow, opts?: { failCreateP2002?: boolean }) {
	const rows = new Map<string, GradingRunRow>()
	if (seed) rows.set(seed.id, seed)

	const store: GradingRunStore = {
		async updateMany({ where, data }) {
			const row = rows.get(where.id)
			if (!row) return { count: 0 }
			const eligible = where.OR.some((clause) => {
				const status = clause.status
				if (typeof status === "object" && status && "in" in status) {
					return status.in.includes(row.status)
				}
				if ("started_at" in clause) {
					const c = clause as {
						status: GradingStatus
						started_at: { lt: Date }
					}
					return row.status === c.status && row.started_at < c.started_at.lt
				}
				return false
			})
			if (!eligible) return { count: 0 }
			rows.set(where.id, {
				...row,
				status: data.status,
				started_at: data.started_at,
			})
			return { count: 1 }
		},
		async findUnique({ where }) {
			const row = rows.get(where.id)
			return row ? { status: row.status } : null
		},
		async create({ data }) {
			if (opts?.failCreateP2002) {
				const err = new Error("Unique constraint failed") as Error & {
					code: string
				}
				err.code = "P2002"
				throw err
			}
			rows.set(data.id, {
				id: data.id,
				status: data.status,
				started_at: data.started_at,
			})
			return data
		},
	}

	return { store, rows }
}

const NOW = new Date("2026-04-26T18:00:00Z")
const JOB = "job-1"

describe("claimGradingRun", () => {
	it("cold start: creates row and returns ok=true", async () => {
		const { store, rows } = makeStore()
		const r = await claimGradingRun(store, JOB, NOW)
		expect(r).toEqual({ ok: true })
		expect(rows.get(JOB)?.status).toBe("processing")
	})

	it("concurrent cold start losing the create race returns already_processing", async () => {
		// updateMany finds nothing (row doesn't exist), findUnique still
		// returns null (race window: another Lambda hasn't committed yet),
		// store.create throws P2002 (the other Lambda just won).
		const { store } = makeStore(undefined, { failCreateP2002: true })
		const r = await claimGradingRun(store, JOB, NOW)
		expect(r).toEqual({ ok: false, reason: "already_processing" })
	})

	it("row in 'pending' is claimable", async () => {
		const { store } = makeStore({
			id: JOB,
			status: "pending",
			started_at: NOW,
		})
		const r = await claimGradingRun(store, JOB, NOW)
		expect(r).toEqual({ ok: true })
	})

	it("row in 'failed' is claimable (retry)", async () => {
		const { store, rows } = makeStore({
			id: JOB,
			status: "failed",
			started_at: NOW,
		})
		const r = await claimGradingRun(store, JOB, NOW)
		expect(r).toEqual({ ok: true })
		expect(rows.get(JOB)?.status).toBe("processing")
	})

	it("row in 'cancelled' is claimable (retry)", async () => {
		const { store } = makeStore({
			id: JOB,
			status: "cancelled",
			started_at: NOW,
		})
		const r = await claimGradingRun(store, JOB, NOW)
		expect(r).toEqual({ ok: true })
	})

	it("row in 'processing' within stale window is NOT claimable", async () => {
		const { store } = makeStore({
			id: JOB,
			status: "processing",
			started_at: new Date(NOW.getTime() - 60_000), // 1 min ago, well inside stale
		})
		const r = await claimGradingRun(store, JOB, NOW)
		expect(r).toEqual({ ok: false, reason: "already_processing" })
	})

	it("row in 'processing' past stale window IS claimable (takeover)", async () => {
		const { store } = makeStore({
			id: JOB,
			status: "processing",
			started_at: new Date(NOW.getTime() - STALE_PROCESSING_MS - 1_000),
		})
		const r = await claimGradingRun(store, JOB, NOW)
		expect(r).toEqual({ ok: true })
	})

	it("row in 'complete' returns already_complete (no work, never re-grade)", async () => {
		const { store } = makeStore({
			id: JOB,
			status: "complete",
			started_at: NOW,
		})
		const r = await claimGradingRun(store, JOB, NOW)
		expect(r).toEqual({ ok: false, reason: "already_complete" })
	})

	it("the duplicate-grade scenario: two concurrent claims, one wins", async () => {
		// Simulates two grade Lambdas firing for the same submission_id:
		// neither has committed yet, both call updateMany (which finds no
		// row), both fall through to create. The second to call create
		// gets P2002.
		const { store } = makeStore()
		const second = makeStore(undefined, { failCreateP2002: true })

		const [r1, r2] = await Promise.all([
			claimGradingRun(store, JOB, NOW),
			claimGradingRun(second.store, JOB, NOW),
		])

		// One wins, one loses. Order isn't specified by the API; the rule is
		// that exactly one claims and the other sees `already_processing`.
		const winners = [r1, r2].filter((r) => r.ok)
		const losers = [r1, r2].filter((r) => !r.ok)
		expect(winners.length).toBe(1)
		expect(losers.length).toBe(1)
		expect(losers[0]).toEqual({
			ok: false,
			reason: "already_processing",
		})
	})
})

import type { OcrStatus } from "@mcp-gcse/db"
import { describe, expect, it } from "vitest"
import {
	type OcrRunStore,
	STALE_PROCESSING_MS,
	claimOcrRun,
} from "../../src/lib/ocr/claim-ocr-run"

/**
 * `claimOcrRun` is the load-bearing piece preventing two OCR Lambdas
 * (or a redelivered SQS message racing the original handler's success
 * write) from clobbering each other's status. These tests pin the
 * contract:
 *
 * - Cold start (no row) → claim succeeds (creates row).
 * - Concurrent cold start losing the create race → claim fails with
 *   `already_processing` (P2002 path).
 * - Row in `pending`/`failed`/`cancelled` → claim succeeds (takes over).
 * - Row in `processing` within stale window → claim fails.
 * - Row in `processing` past stale window → claim succeeds (takeover).
 * - Row in `complete` → claim fails with `already_complete` — this is
 *   the regression the production incident exposed.
 *
 * No DB. The store is an in-memory object that mirrors the relevant
 * subset of Prisma's API.
 */

type OcrRunRow = {
	id: string
	status: OcrStatus
	started_at: Date
}

function makeStore(seed?: OcrRunRow, opts?: { failCreateP2002?: boolean }) {
	const rows = new Map<string, OcrRunRow>()
	if (seed) rows.set(seed.id, seed)

	const store: OcrRunStore = {
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
						status: OcrStatus
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

const NOW = new Date("2026-05-06T13:00:00Z")
const JOB = "ocr-job-1"

describe("claimOcrRun", () => {
	it("cold start: creates row and returns ok=true", async () => {
		const { store, rows } = makeStore()
		const r = await claimOcrRun(store, JOB, NOW)
		expect(r).toEqual({ ok: true })
		expect(rows.get(JOB)?.status).toBe("processing")
	})

	it("concurrent cold start losing the create race returns already_processing", async () => {
		const { store } = makeStore(undefined, { failCreateP2002: true })
		const r = await claimOcrRun(store, JOB, NOW)
		expect(r).toEqual({ ok: false, reason: "already_processing" })
	})

	it("row in 'pending' is claimable (normal first-run path after submit pre-creates)", async () => {
		const { store } = makeStore({
			id: JOB,
			status: "pending",
			started_at: NOW,
		})
		const r = await claimOcrRun(store, JOB, NOW)
		expect(r).toEqual({ ok: true })
	})

	it("row in 'failed' is claimable (DLQ recovery / manual retry)", async () => {
		const { store, rows } = makeStore({
			id: JOB,
			status: "failed",
			started_at: NOW,
		})
		const r = await claimOcrRun(store, JOB, NOW)
		expect(r).toEqual({ ok: true })
		expect(rows.get(JOB)?.status).toBe("processing")
	})

	it("row in 'cancelled' is claimable", async () => {
		const { store } = makeStore({
			id: JOB,
			status: "cancelled",
			started_at: NOW,
		})
		const r = await claimOcrRun(store, JOB, NOW)
		expect(r).toEqual({ ok: true })
	})

	it("row in 'processing' within stale window is NOT claimable", async () => {
		const { store } = makeStore({
			id: JOB,
			status: "processing",
			started_at: new Date(NOW.getTime() - 60_000),
		})
		const r = await claimOcrRun(store, JOB, NOW)
		expect(r).toEqual({ ok: false, reason: "already_processing" })
	})

	it("row in 'processing' past stale window IS claimable (takeover)", async () => {
		const { store } = makeStore({
			id: JOB,
			status: "processing",
			started_at: new Date(NOW.getTime() - STALE_PROCESSING_MS - 1_000),
		})
		const r = await claimOcrRun(store, JOB, NOW)
		expect(r).toEqual({ ok: true })
	})

	it("row in 'complete' returns already_complete — the production-incident regression", async () => {
		// SQS redelivery after handler success used to upsert this row back
		// to 'processing', resetting started_at and erasing the success.
		// With the claim, the second invocation skips and ack's the message.
		const { store, rows } = makeStore({
			id: JOB,
			status: "complete",
			started_at: NOW,
		})
		const r = await claimOcrRun(store, JOB, NOW)
		expect(r).toEqual({ ok: false, reason: "already_complete" })
		expect(rows.get(JOB)?.status).toBe("complete")
	})

	it("two concurrent claims, exactly one wins", async () => {
		const { store } = makeStore()
		const second = makeStore(undefined, { failCreateP2002: true })

		const [r1, r2] = await Promise.all([
			claimOcrRun(store, JOB, NOW),
			claimOcrRun(second.store, JOB, NOW),
		])

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

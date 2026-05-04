import {
	insertConsumesForGradingRuns,
	insertRefundForGradingRun,
	lookupCurrentPeriodId,
	refundFailedGradingRun,
} from "@mcp-gcse/db"
import { type Mock, describe, expect, it, vi } from "vitest"

/**
 * Tests the impure-but-pure-shaped helpers in `@mcp-gcse/db/ledger.ts`. The
 * helpers take a Prisma client (or tx client) as an argument, so we stub a
 * minimal surface here rather than standing up Postgres. Concurrency / FK
 * semantics live in integration tests; this suite proves the early-return
 * branches and that the input payload maps correctly.
 */

type FakeLedgerStore = {
	paperLedgerEntry: {
		createMany: Mock
		findFirst: Mock
		create: Mock
	}
}

// The `db` parameter on the helpers is structurally typed against the real
// Prisma client (which uses Prisma's branded `PrismaPromise<…>` as its return
// type). Our fake satisfies the runtime shape but not the brand, so we cast
// once at the boundary — the established pattern for db-shaped fakes (see
// `packages/backend/src/lib/grading/claim-grading-run.ts`).
function makeFakeLedgerStore(): FakeLedgerStore {
	return {
		paperLedgerEntry: {
			createMany: vi.fn(async () => ({ count: 0 })),
			findFirst: vi.fn(async () => null),
			create: vi.fn(async () => ({ id: "fake-id" })),
		},
	}
}

function uniqueViolation(): Error {
	return Object.assign(new Error("unique violation"), { code: "P2002" })
}

function asLedgerClient(store: FakeLedgerStore): never {
	return store as unknown as never
}

describe("insertConsumesForGradingRuns", () => {
	it("returns inserted: 0 without touching the DB when gradingRunIds is empty", async () => {
		const db = makeFakeLedgerStore()
		const result = await insertConsumesForGradingRuns({
			db: asLedgerClient(db),
			userId: "u_1",
			gradingRunIds: [],
			periodId: null,
		})
		expect(result).toEqual({ inserted: 0 })
		expect(db.paperLedgerEntry.createMany).not.toHaveBeenCalled()
	})

	it("inserts one consume row per grading_run_id with skipDuplicates", async () => {
		const db = makeFakeLedgerStore()
		db.paperLedgerEntry.createMany.mockResolvedValueOnce({ count: 3 })
		const result = await insertConsumesForGradingRuns({
			db: asLedgerClient(db),
			userId: "u_1",
			gradingRunIds: ["gr_a", "gr_b", "gr_c"],
			periodId: "in_42",
		})
		expect(result).toEqual({ inserted: 3 })
		expect(db.paperLedgerEntry.createMany).toHaveBeenCalledOnce()
		expect(db.paperLedgerEntry.createMany).toHaveBeenCalledWith({
			data: [
				{
					user_id: "u_1",
					papers: -1,
					kind: "consume",
					grading_run_id: "gr_a",
					period_id: "in_42",
				},
				{
					user_id: "u_1",
					papers: -1,
					kind: "consume",
					grading_run_id: "gr_b",
					period_id: "in_42",
				},
				{
					user_id: "u_1",
					papers: -1,
					kind: "consume",
					grading_run_id: "gr_c",
					period_id: "in_42",
				},
			],
			skipDuplicates: true,
		})
	})

	it("treats null periodId as 'no current period' (trial / PPU-only)", async () => {
		const db = makeFakeLedgerStore()
		db.paperLedgerEntry.createMany.mockResolvedValueOnce({ count: 1 })
		await insertConsumesForGradingRuns({
			db: asLedgerClient(db),
			userId: "u_1",
			gradingRunIds: ["gr_a"],
			periodId: null,
		})
		expect(db.paperLedgerEntry.createMany).toHaveBeenCalledWith(
			expect.objectContaining({
				data: [expect.objectContaining({ period_id: null })],
			}),
		)
	})

	it("reports inserted: 0 when DB reports no new rows (replay no-op)", async () => {
		const db = makeFakeLedgerStore()
		db.paperLedgerEntry.createMany.mockResolvedValueOnce({ count: 0 })
		const result = await insertConsumesForGradingRuns({
			db: asLedgerClient(db),
			userId: "u_1",
			gradingRunIds: ["gr_a"],
			periodId: null,
		})
		expect(result).toEqual({ inserted: 0 })
	})
})

describe("lookupCurrentPeriodId", () => {
	it("returns null without querying for non-Pro plans (Limitless)", async () => {
		const db = makeFakeLedgerStore()
		const result = await lookupCurrentPeriodId({
			db: asLedgerClient(db),
			userId: "u_1",
			plan: "limitless_monthly",
		})
		expect(result).toBeNull()
		expect(db.paperLedgerEntry.findFirst).not.toHaveBeenCalled()
	})

	it("returns null without querying for trial / PPU-only users (plan = null)", async () => {
		const db = makeFakeLedgerStore()
		const result = await lookupCurrentPeriodId({
			db: asLedgerClient(db),
			userId: "u_1",
			plan: null,
		})
		expect(result).toBeNull()
		expect(db.paperLedgerEntry.findFirst).not.toHaveBeenCalled()
	})

	it("returns the period_id from the latest subscription_grant for capped Pro", async () => {
		const db = makeFakeLedgerStore()
		db.paperLedgerEntry.findFirst.mockResolvedValueOnce({ period_id: "in_99" })
		const result = await lookupCurrentPeriodId({
			db: asLedgerClient(db),
			userId: "u_1",
			plan: "pro_monthly",
		})
		expect(result).toBe("in_99")
		expect(db.paperLedgerEntry.findFirst).toHaveBeenCalledWith({
			where: {
				user_id: "u_1",
				kind: "subscription_grant",
			},
			orderBy: { created_at: "desc" },
			select: { period_id: true },
		})
	})

	it("returns null when capped Pro has no subscription_grant yet", async () => {
		const db = makeFakeLedgerStore()
		db.paperLedgerEntry.findFirst.mockResolvedValueOnce(null)
		const result = await lookupCurrentPeriodId({
			db: asLedgerClient(db),
			userId: "u_1",
			plan: "pro_monthly",
		})
		expect(result).toBeNull()
	})

	it("returns null when the latest grant has period_id explicitly null (defensive)", async () => {
		const db = makeFakeLedgerStore()
		db.paperLedgerEntry.findFirst.mockResolvedValueOnce({ period_id: null })
		const result = await lookupCurrentPeriodId({
			db: asLedgerClient(db),
			userId: "u_1",
			plan: "pro_monthly",
		})
		expect(result).toBeNull()
	})
})

describe("insertRefundForGradingRun", () => {
	it("inserts a positive refund row with the consume's period_id snapshot", async () => {
		const db = makeFakeLedgerStore()
		const result = await insertRefundForGradingRun({
			db: asLedgerClient(db),
			userId: "u_1",
			gradingRunId: "gr_42",
			periodId: "in_99",
		})
		expect(result).toEqual({ refunded: true })
		expect(db.paperLedgerEntry.create).toHaveBeenCalledWith({
			data: {
				user_id: "u_1",
				papers: 1,
				kind: "refund",
				grading_run_id: "gr_42",
				period_id: "in_99",
				granted_by_user_id: undefined,
				note: undefined,
			},
		})
	})

	it("returns refunded:false on unique-constraint replay", async () => {
		const db = makeFakeLedgerStore()
		db.paperLedgerEntry.create.mockRejectedValueOnce(uniqueViolation())
		const result = await insertRefundForGradingRun({
			db: asLedgerClient(db),
			userId: "u_1",
			gradingRunId: "gr_42",
			periodId: null,
		})
		expect(result).toEqual({ refunded: false })
	})

	it("rethrows non-unique errors", async () => {
		const db = makeFakeLedgerStore()
		db.paperLedgerEntry.create.mockRejectedValueOnce(new Error("connection"))
		await expect(
			insertRefundForGradingRun({
				db: asLedgerClient(db),
				userId: "u_1",
				gradingRunId: "gr_42",
				periodId: null,
			}),
		).rejects.toThrow(/connection/)
	})
})

describe("refundFailedGradingRun", () => {
	it("returns foundConsume:false without inserting when no consume exists", async () => {
		const db = makeFakeLedgerStore()
		// findFirst returns null (no consume row) — admin / Limitless path
		db.paperLedgerEntry.findFirst.mockResolvedValueOnce(null)
		const result = await refundFailedGradingRun({
			db: asLedgerClient(db),
			gradingRunId: "gr_42",
		})
		expect(result).toEqual({ refunded: false, foundConsume: false })
		expect(db.paperLedgerEntry.create).not.toHaveBeenCalled()
	})

	it("looks up consume row, copies user+period, inserts refund", async () => {
		const db = makeFakeLedgerStore()
		db.paperLedgerEntry.findFirst.mockResolvedValueOnce({
			user_id: "u_7",
			period_id: "in_99",
		})
		const result = await refundFailedGradingRun({
			db: asLedgerClient(db),
			gradingRunId: "gr_42",
		})
		expect(result).toEqual({ refunded: true, foundConsume: true })
		expect(db.paperLedgerEntry.findFirst).toHaveBeenCalledWith({
			where: { kind: "consume", grading_run_id: "gr_42" },
			select: { user_id: true, period_id: true },
		})
		expect(db.paperLedgerEntry.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				user_id: "u_7",
				papers: 1,
				kind: "refund",
				grading_run_id: "gr_42",
				period_id: "in_99",
			}),
		})
	})

	it("propagates idempotent replay (consume exists, refund insert is duplicate)", async () => {
		const db = makeFakeLedgerStore()
		db.paperLedgerEntry.findFirst.mockResolvedValueOnce({
			user_id: "u_7",
			period_id: null,
		})
		db.paperLedgerEntry.create.mockRejectedValueOnce(uniqueViolation())
		const result = await refundFailedGradingRun({
			db: asLedgerClient(db),
			gradingRunId: "gr_42",
		})
		expect(result).toEqual({ refunded: false, foundConsume: true })
	})
})

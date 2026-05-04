import { db } from "@/lib/db"
import {
	LedgerEntryKind,
	type Prisma,
	insertConsumesForGradingRuns as insertConsumesForGradingRunsShared,
} from "@mcp-gcse/db"

/**
 * Web-side paper ledger helpers (impure — Prisma-backed). The append-only
 * `paper_ledger` table is the single source of truth for "how many papers
 * does this user have available?": `SUM(papers) WHERE user_id = ?`.
 *
 * Idempotency lives in the schema's unique constraints:
 *  - `stripe_session_id` UNIQUE → PPU/topup grant replay is a no-op
 *  - `stripe_invoice_id` UNIQUE → subscription grant + period expiry replay is a no-op
 *  - `@@unique([kind, grading_run_id])` → consume/refund replay is a no-op
 *
 * The Stripe-write helpers (insertSubscriptionGrant, expirePreviousPeriodGrant,
 * insertPpuPurchase, insertTopUpPurchase) live in `@mcp-gcse/db/ledger.ts` and
 * are called directly from the backend Lambda's webhook route. This module
 * keeps the helpers only the web app needs: balance reads, the consume
 * reservation wrapper, refunds, trial seeding, and admin grants.
 *
 * See `docs/build-plan-2026-05-02-pricing-restructure.md` for the model
 * rationale and the full kind-by-kind interpretation.
 */

// ─── Balance ─────────────────────────────────────────────────────────────────

/**
 * Cross-exam paper balance for a user. Aggregates the entire ledger —
 * `SUM(papers)` over all kinds. Period_expiry rows handle subscription
 * credit decay by being negative entries that get summed alongside everything
 * else, so this single query is always the user's true balance.
 *
 * Named "shared" rather than "balance" because future PPU exam-scoping will
 * add a sibling `getExamBalance(userId, examPaperId)` that draws from the
 * scoped pool first then falls through to this shared pool. See the deferred
 * design decisions in the build plan.
 */
export async function getSharedBalance(userId: string): Promise<number> {
	const result = await db.paperLedgerEntry.aggregate({
		where: { user_id: userId },
		_sum: { papers: true },
	})
	return result._sum.papers ?? 0
}

/**
 * Per-period usage snapshot for capped Pro subscribers — the data behind the
 * "47 of 60 papers used this month · resets 28 May" UI. Returns null when
 * the user has no subscription_grant yet (trial / PPU-only / brand-new
 * subscriber whose first invoice hasn't landed).
 *
 * `consumed` is computed against the latest period's `period_id`, so a
 * just-rolled-over user shows 0/60 cleanly.
 */
export async function getCurrentPeriodUsage(userId: string): Promise<{
	grantSize: number
	consumed: number
	periodId: string
	periodEndsAt: Date | null
} | null> {
	const latestGrant = await db.paperLedgerEntry.findFirst({
		where: {
			user_id: userId,
			kind: LedgerEntryKind.subscription_grant,
		},
		orderBy: { created_at: "desc" },
		select: { period_id: true, papers: true, period_ends_at: true },
	})
	if (!latestGrant?.period_id) return null
	const consumesAgg = await db.paperLedgerEntry.aggregate({
		where: {
			user_id: userId,
			kind: LedgerEntryKind.consume,
			period_id: latestGrant.period_id,
		},
		_sum: { papers: true },
	})
	return {
		grantSize: latestGrant.papers,
		consumed: -(consumesAgg._sum.papers ?? 0),
		periodId: latestGrant.period_id,
		periodEndsAt: latestGrant.period_ends_at,
	}
}

// ─── Consumption ─────────────────────────────────────────────────────────────

/**
 * Reserve one consume entry per pre-generated grading_run_id. Called at
 * batch-commit / re-mark / re-scan time inside the same transaction as the
 * StudentSubmission + GradingRun creation — debit and work-scheduling are
 * atomic, closing the over-spend race that an after-the-fact debit would
 * leave open.
 *
 * Pass `tx` (the interactive-transaction client) to participate in the
 * caller's transaction; pass nothing to use the global `db` singleton.
 *
 * Idempotent — replays from Lambda backfill calls or SQS retries no-op via
 * `@@unique([kind, grading_run_id])`.
 */
export async function insertConsumesForBatch(args: {
	userId: string
	gradingRunIds: string[]
	periodId: string | null
	tx?: Prisma.TransactionClient
}): Promise<{ inserted: number }> {
	return insertConsumesForGradingRunsShared({
		db: args.tx ?? db,
		userId: args.userId,
		gradingRunIds: args.gradingRunIds,
		periodId: args.periodId,
	})
}

/**
 * Refund a previously-consumed grading run. Idempotent via the
 * `@@unique([kind, grading_run_id])` constraint — only one refund per
 * grading_run_id can exist regardless of how many times this is called.
 *
 * `grantedByUserId` + `note` are optional audit fields used when a human
 * operator issues the refund (e.g. "manual refund — student paper had a
 * scan error"). System-issued refunds (e.g. automatic Lambda-side recovery)
 * leave them null.
 *
 * Returns false if a refund row already exists for this grading_run (so
 * the caller knows the no-op happened); true if a new row was inserted.
 */
export async function insertRefundForGradingRun(args: {
	userId: string
	gradingRunId: string
	grantedByUserId?: string
	note?: string
}): Promise<{ refunded: boolean }> {
	try {
		await db.paperLedgerEntry.create({
			data: {
				user_id: args.userId,
				papers: 1,
				kind: LedgerEntryKind.refund,
				grading_run_id: args.gradingRunId,
				granted_by_user_id: args.grantedByUserId,
				note: args.note,
			},
		})
		return { refunded: true }
	} catch (err) {
		if (isUniqueViolation(err)) return { refunded: false }
		throw err
	}
}

// ─── Trial seeding ───────────────────────────────────────────────────────────

/**
 * Seed a new user's trial allowance. Idempotent on (user_id, kind=trial_grant)
 * via the application-level pre-check; with one trial_grant per user expected,
 * this race is acceptable (worst case: a user retries within milliseconds and
 * sees a brief 40-paper allowance instead of 20). For stricter idempotency,
 * add a partial unique index later.
 */
export async function insertTrialGrant(args: {
	userId: string
	papers: number
}): Promise<{ granted: boolean }> {
	const existing = await db.paperLedgerEntry.findFirst({
		where: { user_id: args.userId, kind: LedgerEntryKind.trial_grant },
		select: { id: true },
	})
	if (existing) return { granted: false }
	await db.paperLedgerEntry.create({
		data: {
			user_id: args.userId,
			papers: args.papers,
			kind: LedgerEntryKind.trial_grant,
		},
	})
	return { granted: true }
}

// ─── Admin grants ────────────────────────────────────────────────────────────

/**
 * Manual support grant — e.g. compensating for an outage or honouring a
 * goodwill credit. `grantedByUserId` records the admin who issued the grant;
 * `note` is optional free-form context surfaced in the audit UI.
 *
 * No idempotency key — same grant called twice grants twice (caller is the
 * human operator and is expected not to double-fire). Negative `papers`
 * values are allowed for reversing a grant issued in error.
 */
export async function insertAdminGrant(args: {
	userId: string
	papers: number
	grantedByUserId: string
	note?: string
}): Promise<{ id: string }> {
	const row = await db.paperLedgerEntry.create({
		data: {
			user_id: args.userId,
			papers: args.papers,
			kind: LedgerEntryKind.admin_grant,
			granted_by_user_id: args.grantedByUserId,
			note: args.note,
		},
		select: { id: true },
	})
	return row
}

// ─── Internal ────────────────────────────────────────────────────────────────

function isUniqueViolation(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		"code" in err &&
		(err as Prisma.PrismaClientKnownRequestError).code === "P2002"
	)
}

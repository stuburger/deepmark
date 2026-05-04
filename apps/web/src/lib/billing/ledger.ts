import { db } from "@/lib/db"
import {
	LedgerEntryKind,
	type Plan,
	type Prisma,
	insertConsumesForGradingRuns as insertConsumesForGradingRunsShared,
	seedTrialGrant as seedTrialGrantShared,
} from "@mcp-gcse/db"

import { InsufficientBalanceError } from "./types"

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
	// Net consumed = SUM(consume + refund) within the period. Refunds carry
	// the same period_id as the consume they undo, so a DLQ-driven refund
	// brings the displayed "this month's used" back down accordingly.
	const consumesAgg = await db.paperLedgerEntry.aggregate({
		where: {
			user_id: userId,
			kind: { in: [LedgerEntryKind.consume, LedgerEntryKind.refund] },
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
 * atomic.
 *
 * `tx` is **required** (not optional) because the over-spend protection
 * uses a `pg_advisory_xact_lock` that auto-releases at COMMIT/ROLLBACK; a
 * lock outside any transaction would release immediately and provide no
 * mutual exclusion. All call sites (commit-service, re-mark, re-scan)
 * already wrap in `db.$transaction`.
 *
 * Race protection: `assertPapersQuota` outside this function is a fast-fail
 * pre-check with no locking, so two parallel batches could both pass it
 * with the same observed balance. Inside this function we acquire a
 * per-user advisory lock and re-read the balance; the second batch to
 * arrive at the lock either still has headroom (and proceeds) or sees the
 * post-debit balance from the first batch and throws
 * `InsufficientBalanceError`, rolling its tx back without the consume
 * rows landing.
 *
 * `plan` is threaded through so the in-tx throw produces the same
 * plan-aware error copy as the pre-flight `assertPapersQuota` would.
 * Without it, racing batches would see the generic "insufficient
 * balance" toast instead of the plan-specific "monthly limit hit — top
 * up" / "buy a set or subscribe" copy.
 *
 * Idempotent on replay — `@@unique([kind, grading_run_id])` makes a retry
 * with the same grading_run_ids a silent no-op.
 */
export async function insertConsumesForBatch(args: {
	userId: string
	gradingRunIds: string[]
	periodId: string | null
	plan: Plan | null
	tx: Prisma.TransactionClient
}): Promise<{ inserted: number }> {
	if (args.gradingRunIds.length === 0) return { inserted: 0 }

	// Per-user serialization. hashtext() returns int; pg_advisory_xact_lock
	// widens to bigint. Hash collisions across users are 1-in-4B and only
	// cause unrelated users to briefly serialize — no correctness impact.
	// $executeRaw (vs $queryRaw) because pg_advisory_xact_lock returns void
	// and Prisma can't deserialize that into a result set.
	await args.tx
		.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${args.userId}))`

	const balanceAgg = await args.tx.paperLedgerEntry.aggregate({
		where: { user_id: args.userId },
		_sum: { papers: true },
	})
	const balance = balanceAgg._sum.papers ?? 0
	if (balance < args.gradingRunIds.length) {
		throw new InsufficientBalanceError(
			balance,
			args.gradingRunIds.length,
			args.plan,
		)
	}

	return insertConsumesForGradingRunsShared({
		db: args.tx,
		userId: args.userId,
		gradingRunIds: args.gradingRunIds,
		periodId: args.periodId,
	})
}

// ─── Trial seeding ───────────────────────────────────────────────────────────

/**
 * Web wrapper around `@mcp-gcse/db`'s `seedTrialGrant`, binding the
 * singleton `db`. No production caller currently — auth.ts owns the
 * trial-seed call site and uses the shared helper directly.
 */
export async function insertTrialGrant(args: {
	userId: string
	papers: number
}): Promise<{ granted: boolean }> {
	return seedTrialGrantShared({
		db,
		userId: args.userId,
		papers: args.papers,
	})
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

import {
	LedgerEntryKind,
	type Plan,
	Prisma,
	type PrismaClient,
} from "./generated/prisma/client"

/**
 * Shared paper-ledger writes. Lives in `@mcp-gcse/db` so both the web app
 * (server actions / commit-service) and backend Lambda processors (Stripe
 * webhook + grading workers) can call the same code path — duplicating the
 * ledger row shape would let it drift between caller sites.
 *
 * Pure-ish: every helper takes the Prisma client (or a tx client) as its
 * first arg, never imports `Resource` or any SST glue, and is safe to call
 * from inside a transaction.
 *
 * Web-side reads (balance + per-period usage) and trial / admin writes stay
 * in `apps/web/src/lib/billing/ledger.ts` — no cross-package caller for those
 * yet.
 */

// Minimal Prisma surface we use here — accepts both a full PrismaClient and
// an interactive-transaction client, since the per-table method shapes match.
type PaperLedgerWriter = Pick<
	PrismaClient["paperLedgerEntry"],
	"create" | "createMany" | "findFirst" | "aggregate"
>
type LedgerCapableClient = {
	paperLedgerEntry: PaperLedgerWriter
}

/**
 * True when `err` is a Prisma unique-constraint violation (P2002). All
 * ledger writes that rely on a unique-index for idempotency catch this and
 * treat the duplicate as a successful no-op.
 */
export function isUniqueViolation(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		"code" in err &&
		(err as Prisma.PrismaClientKnownRequestError).code === "P2002"
	)
}

/**
 * Insert one `consume` ledger entry per grading_run_id. Idempotent via the
 * schema's `@@unique([kind, grading_run_id])` — replays (e.g. SQS retries
 * landing on the Lambda after the consume was already reserved at submit
 * time) are silent no-ops.
 *
 * `periodId` snapshots which billing period these consumes draw against —
 * used at query time to compute "47 of 60 used this month" for capped Pro
 * users. Trial / PPU-only users pass `null`.
 *
 * Pass a transaction client (`tx`) when reserving as part of a larger
 * commit to atomically tie the debit to the work being scheduled.
 */
export async function insertConsumesForGradingRuns(args: {
	db: LedgerCapableClient
	userId: string
	gradingRunIds: string[]
	periodId: string | null
}): Promise<{ inserted: number }> {
	if (args.gradingRunIds.length === 0) return { inserted: 0 }
	const result = await args.db.paperLedgerEntry.createMany({
		data: args.gradingRunIds.map((id) => ({
			user_id: args.userId,
			papers: -1,
			kind: LedgerEntryKind.consume,
			grading_run_id: id,
			period_id: args.periodId,
		})),
		skipDuplicates: true,
	})
	return { inserted: result.count }
}

/**
 * Resolve which billing period a debit should be charged against. Returns
 * the latest `subscription_grant.period_id` for capped Pro users; null for
 * trial / PPU-only / Unlimited / admin (Unlimited + admin never reach a
 * debit path; the null return for them is defensive).
 *
 * Snapshotted at debit time so a consume row's `period_id` is stable even
 * if the period rolls over between reservation and Lambda completion.
 */
export async function lookupCurrentPeriodId(args: {
	db: LedgerCapableClient
	userId: string
	plan: Plan | null
}): Promise<string | null> {
	if (args.plan !== "pro_monthly") return null
	const latestGrant = await args.db.paperLedgerEntry.findFirst({
		where: {
			user_id: args.userId,
			kind: LedgerEntryKind.subscription_grant,
		},
		orderBy: { created_at: "desc" },
		select: { period_id: true },
	})
	return latestGrant?.period_id ?? null
}

// ─── Refunds ─────────────────────────────────────────────────────────────────

/**
 * Refund a previously-consumed grading run. Idempotent via the
 * `@@unique([kind, grading_run_id])` constraint — only one refund per
 * grading_run_id can exist regardless of how many times this is called.
 *
 * `periodId` should snapshot the same period as the consume row being
 * undone, so per-period usage queries (which net consume + refund per
 * period_id) reflect the refund correctly. Pass `null` for refunds whose
 * consume had no period (trial / PPU-only).
 *
 * `grantedByUserId` + `note` are optional audit fields used when a human
 * operator issues the refund. System-issued refunds (DLQ-driven) leave them
 * null. Returns `{ refunded: false }` on idempotent replay.
 */
export async function insertRefundForGradingRun(args: {
	db: LedgerCapableClient
	userId: string
	gradingRunId: string
	periodId: string | null
	grantedByUserId?: string
	note?: string
}): Promise<{ refunded: boolean }> {
	try {
		await args.db.paperLedgerEntry.create({
			data: {
				user_id: args.userId,
				papers: 1,
				kind: LedgerEntryKind.refund,
				grading_run_id: args.gradingRunId,
				period_id: args.periodId,
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

/**
 * Refund a grading run whose work has terminally failed (DLQ-delivered).
 * Looks up the original consume row by `grading_run_id` to recover the
 * `user_id` + `period_id`, then inserts a matching refund row. Returns
 * `{ refunded: false, foundConsume: false }` when no consume row exists —
 * the normal case for admin / Unlimited / never-reserved jobs.
 *
 * Idempotent: calling twice for the same grading_run produces one refund
 * row. Safe to call from both OCR and grading DLQ handlers; only the first
 * succeeds.
 */
export async function refundFailedGradingRun(args: {
	db: LedgerCapableClient
	gradingRunId: string
}): Promise<{ refunded: boolean; foundConsume: boolean }> {
	const consume = await args.db.paperLedgerEntry.findFirst({
		where: {
			kind: LedgerEntryKind.consume,
			grading_run_id: args.gradingRunId,
		},
		select: { user_id: true, period_id: true },
	})
	if (!consume) return { refunded: false, foundConsume: false }
	const result = await insertRefundForGradingRun({
		db: args.db,
		userId: consume.user_id,
		gradingRunId: args.gradingRunId,
		periodId: consume.period_id,
	})
	return { refunded: result.refunded, foundConsume: true }
}

// ─── Subscription period grants ──────────────────────────────────────────────

/**
 * Grant the new period's papers for a capped subscription. Called from the
 * Stripe webhook's `invoice.payment_succeeded` handler. Idempotent via the
 * `stripe_invoice_id` UNIQUE constraint — webhook replay returns
 * `granted: false` without inserting a duplicate.
 */
export async function insertSubscriptionGrant(args: {
	db: LedgerCapableClient
	userId: string
	papers: number
	stripeInvoiceId: string
	periodId: string
	periodStartsAt: Date
	periodEndsAt: Date
}): Promise<{ granted: boolean }> {
	try {
		await args.db.paperLedgerEntry.create({
			data: {
				user_id: args.userId,
				papers: args.papers,
				kind: LedgerEntryKind.subscription_grant,
				stripe_invoice_id: args.stripeInvoiceId,
				period_id: args.periodId,
				period_starts_at: args.periodStartsAt,
				period_ends_at: args.periodEndsAt,
			},
		})
		return { granted: true }
	} catch (err) {
		if (isUniqueViolation(err)) return { granted: false }
		throw err
	}
}

/**
 * Insert a period_expiry entry zeroing the prior period's unused subscription
 * papers. Reads the prior period's grant + consumes, computes the unused
 * amount, and writes a single negative entry. Idempotent via
 * `stripe_invoice_id` UNIQUE — the new invoice's id is the idempotency key
 * (since the new invoice is what triggered this expiry).
 *
 * If no prior subscription_grant exists (first invoice), this is a no-op.
 */
export async function expirePreviousPeriodGrant(args: {
	db: LedgerCapableClient
	userId: string
	newInvoiceId: string
}): Promise<{ expired: number }> {
	const previousGrant = await args.db.paperLedgerEntry.findFirst({
		where: {
			user_id: args.userId,
			kind: LedgerEntryKind.subscription_grant,
			NOT: { stripe_invoice_id: args.newInvoiceId },
		},
		orderBy: { created_at: "desc" },
		select: {
			id: true,
			papers: true,
			period_id: true,
		},
	})
	if (!previousGrant?.period_id) return { expired: 0 }

	// Net consumed = SUM(consume + refund) within the period. Refunds carry
	// the same period_id as the consume they undo, so a -1 + +1 nets to 0
	// within the aggregate — rolling-over a period with refunded failures
	// gives back the right unused amount.
	const consumesAgg = await args.db.paperLedgerEntry.aggregate({
		where: {
			user_id: args.userId,
			kind: { in: [LedgerEntryKind.consume, LedgerEntryKind.refund] },
			period_id: previousGrant.period_id,
		},
		_sum: { papers: true },
	})
	const consumed = -(consumesAgg._sum.papers ?? 0)
	const unused = computePeriodExpiryAmount(previousGrant.papers, consumed)
	if (unused === 0) return { expired: 0 }

	try {
		await args.db.paperLedgerEntry.create({
			data: {
				user_id: args.userId,
				papers: -unused,
				kind: LedgerEntryKind.period_expiry,
				stripe_invoice_id: args.newInvoiceId,
				period_id: previousGrant.period_id,
			},
		})
		return { expired: unused }
	} catch (err) {
		if (isUniqueViolation(err)) return { expired: 0 }
		throw err
	}
}

// ─── One-off purchases (PPU + top-ups) ───────────────────────────────────────

/**
 * Grant papers from a completed PPU checkout. Idempotent via
 * `stripe_session_id` UNIQUE — webhook replay returns `granted: false`.
 */
export async function insertPpuPurchase(args: {
	db: LedgerCapableClient
	userId: string
	papers: number
	stripeSessionId: string
}): Promise<{ granted: boolean }> {
	return insertPurchaseEntry({
		db: args.db,
		userId: args.userId,
		papers: args.papers,
		stripeSessionId: args.stripeSessionId,
		kind: LedgerEntryKind.purchase_ppu,
	})
}

/**
 * Grant papers from a completed top-up checkout. Idempotent via
 * `stripe_session_id` UNIQUE.
 */
export async function insertTopUpPurchase(args: {
	db: LedgerCapableClient
	userId: string
	papers: number
	stripeSessionId: string
}): Promise<{ granted: boolean }> {
	return insertPurchaseEntry({
		db: args.db,
		userId: args.userId,
		papers: args.papers,
		stripeSessionId: args.stripeSessionId,
		kind: LedgerEntryKind.purchase_topup,
	})
}

async function insertPurchaseEntry(args: {
	db: LedgerCapableClient
	userId: string
	papers: number
	stripeSessionId: string
	kind:
		| typeof LedgerEntryKind.purchase_ppu
		| typeof LedgerEntryKind.purchase_topup
}): Promise<{ granted: boolean }> {
	try {
		await args.db.paperLedgerEntry.create({
			data: {
				user_id: args.userId,
				papers: args.papers,
				kind: args.kind,
				stripe_session_id: args.stripeSessionId,
			},
		})
		return { granted: true }
	} catch (err) {
		if (isUniqueViolation(err)) return { granted: false }
		throw err
	}
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Compute how many subscription-pool papers should be expired at period
 * rollover. Pure: takes the period's grant amount and the consumes recorded
 * against that period; returns the unused amount that needs to be removed
 * from the user's running balance so the new period starts clean.
 *
 * Negative returns clamp to 0 — if a user somehow consumed more than was
 * granted (e.g. a backfill anomaly), the expiry doesn't go positive.
 */
export function computePeriodExpiryAmount(
	subscriptionGrant: number,
	consumesInPeriod: number,
): number {
	const unused = subscriptionGrant - consumesInPeriod
	return Math.max(0, unused)
}

// ─── Trial seeding ───────────────────────────────────────────────────────────

/**
 * Seed a fresh user's free-trial paper allowance as a single `trial_grant`
 * ledger entry. Called from auth (every login, idempotent) and the web's
 * helper (no production caller currently). Idempotency:
 *
 *  1. Fast path: a `findFirst` short-circuits returning users without a write.
 *  2. Race path: two concurrent first-time logins both pass the findFirst,
 *     one wins the `create`, the other throws P2002 against the partial
 *     unique index `paper_ledger_trial_grant_per_user_idx` defined in
 *     `setup-vectors.sql`. We catch it and return `granted: false`.
 *
 * `papers` is the trial allowance amount — comes from `Resource.StripeConfig`
 * but accepted as a parameter here so this module stays SST-agnostic.
 */
export async function seedTrialGrant(args: {
	db: LedgerCapableClient
	userId: string
	papers: number
}): Promise<{ granted: boolean }> {
	const existing = await args.db.paperLedgerEntry.findFirst({
		where: { user_id: args.userId, kind: LedgerEntryKind.trial_grant },
		select: { id: true },
	})
	if (existing) return { granted: false }
	try {
		await args.db.paperLedgerEntry.create({
			data: {
				user_id: args.userId,
				papers: args.papers,
				kind: LedgerEntryKind.trial_grant,
			},
		})
		return { granted: true }
	} catch (err) {
		if (isUniqueViolation(err)) return { granted: false }
		throw err
	}
}

// Re-export for callers that want to handle Prisma errors themselves.
export { Prisma }

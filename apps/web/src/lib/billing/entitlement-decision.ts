import { Plan } from "@mcp-gcse/db"

/**
 * Pure decision logic for billing entitlement. No DB / Stripe / SST imports
 * — every function here is a deterministic transformation of inputs to
 * outputs, so tests don't need to mock infrastructure.
 *
 * The impure orchestrator lives in `./entitlement.ts` and uses these
 * functions after fetching the user row + ledger balance.
 */

export type UserSnapshot = {
	role: string
	plan: Plan | null
	subscription_status: string | null
}

/**
 * Discriminated state used as the single source of truth for "can this user
 * mark another paper?". Three kinds:
 *
 *  - `admin`     → bypass all quota / ledger logic
 *  - `uncapped`  → active sub on a non-metered plan (limitless)
 *  - `metered`   → balance-gated (trial users, PPU-only, capped Pro all share
 *                  this path; the underlying ledger entries differ but the
 *                  enforcement check is identical)
 *
 * Capped Pro, PPU-only, and trial users all collapse into `metered` because
 * the ledger naturally encodes their differences (trial_grant +20, vs.
 * subscription_grant +60 + period_id, vs. purchase_ppu +30 stripe_session_id).
 * The single SUM(papers) read is the truth regardless of where those papers
 * came from.
 */
export type Entitlement =
	| { kind: "admin" }
	| { kind: "uncapped"; plan: Plan }
	| { kind: "metered"; balance: number; plan: Plan | null }

const PAID_STATUSES = new Set(["active", "trialing"])

/**
 * Pure: takes a user snapshot + a balance and returns the entitlement shape.
 * Extracted from `getEntitlement` so the decision matrix is unit-testable
 * without mocking Prisma.
 */
export function decideEntitlement(args: {
	user: UserSnapshot | null
	balance: number
}): Entitlement {
	const { user, balance } = args
	if (!user) return { kind: "metered", balance, plan: null }
	if (user.role === "admin") return { kind: "admin" }

	const isActiveSub =
		user.plan !== null &&
		user.subscription_status !== null &&
		PAID_STATUSES.has(user.subscription_status)

	if (isActiveSub && user.plan === Plan.limitless_monthly) {
		return { kind: "uncapped", plan: user.plan }
	}

	return {
		kind: "metered",
		balance,
		plan: isActiveSub ? user.plan : null,
	}
}

/**
 * Pure: given an entitlement and a request size, decide whether the action
 * can proceed. Returns `{ ok: true }` for admin/uncapped (no check needed)
 * and for metered users with sufficient balance; otherwise returns the
 * insufficient context the caller can throw with.
 */
export function decideQuotaCheck(args: {
	entitlement: Entitlement
	additionalPapers: number
}):
	| { ok: true }
	| {
			ok: false
			balance: number
			requested: number
			plan: Plan | null
	  } {
	const { entitlement, additionalPapers } = args
	if (entitlement.kind === "admin" || entitlement.kind === "uncapped") {
		return { ok: true }
	}
	if (entitlement.balance >= additionalPapers) {
		return { ok: true }
	}
	return {
		ok: false,
		balance: entitlement.balance,
		requested: additionalPapers,
		plan: entitlement.plan,
	}
}

/**
 * Pure predicate retained for callers that only need a yes/no on "is this
 * user paying us for an active subscription?" — not the same as having
 * marking entitlement (uncapped + metered/Pro both qualify; trial / PPU-only
 * don't).
 */
export function isActivelyEntitled(user: UserSnapshot): boolean {
	if (!user.plan) return false
	return PAID_STATUSES.has(user.subscription_status ?? "")
}

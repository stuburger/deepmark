import { db } from "@/lib/db"

import { countCompletedGradingRuns, trialPaperCap } from "./quota"
import { TrialExhaustedError } from "./types"

/**
 * Discriminated state used as the single source of truth for "can this user
 * mark another paper?". Three callers consume it:
 *  - the markingAction quota gate (admin/active → pass; trial → check cap)
 *  - the in-app trial banner (renders only on "trial")
 *  - any future surface that needs the same answer
 *
 * Future "grace" kind (paid user with status "canceled" but inside the
 * paid period) slots in here without changing call sites that branch on
 * `kind === "trial"`.
 */
export type Entitlement =
	| { kind: "admin" }
	| { kind: "active" }
	| {
			kind: "trial"
			used: number
			cap: number
			remaining: number
			exhausted: boolean
	  }

type SubscriptionFields = {
	plan: string | null
	subscription_status: string | null
}

/**
 * Pure predicate: does this user record reflect an actively-entitled paid
 * subscription? Both `plan` and a paying status must be set; "past_due",
 * "canceled" etc. are NOT entitled — the subscription needs attention.
 */
export function isActivelyEntitled(user: SubscriptionFields): boolean {
	if (!user.plan) return false
	return (
		user.subscription_status === "active" ||
		user.subscription_status === "trialing"
	)
}

/**
 * Resolve the user's marking entitlement. Cheap path first — paid users do
 * exactly one DB query (the user select). Trial users add a second indexed
 * COUNT for completed grading runs.
 */
export async function getEntitlement(userId: string): Promise<Entitlement> {
	const user = await db.user.findUnique({
		where: { id: userId },
		select: { role: true, plan: true, subscription_status: true },
	})
	if (!user) {
		// Unknown user — treat as fresh trial. Defensive: shouldn't happen for
		// an authenticated session, but covers the gap if a user row is deleted
		// while a session token still exists.
		const cap = trialPaperCap()
		return { kind: "trial", used: 0, cap, remaining: cap, exhausted: false }
	}
	if (user.role === "admin") return { kind: "admin" }
	if (isActivelyEntitled(user)) return { kind: "active" }

	const cap = trialPaperCap()
	const used = await countCompletedGradingRuns(userId)
	const remaining = Math.max(0, cap - used)
	return {
		kind: "trial",
		used,
		cap,
		remaining,
		exhausted: remaining === 0,
	}
}

/**
 * Throw TrialExhaustedError if the user can't consume `additionalPapers`
 * more marking quota. Used by the markingAction middleware (additionalPapers
 * = 1) and the batch-commit action (additionalPapers = staged-script count).
 *
 * Lambda processors should re-check this before doing real work — the
 * client-side check can race (double-click, two tabs, queued retries).
 */
export async function enforcePapersQuota({
	user,
	additionalPapers,
}: {
	user: { id: string }
	additionalPapers: number
}): Promise<void> {
	const ent = await getEntitlement(user.id)
	if (ent.kind === "admin" || ent.kind === "active") return
	if (ent.used + additionalPapers > ent.cap) {
		throw new TrialExhaustedError(
			`Free trial covers ${ent.cap} papers (you've used ${ent.used}). Upgrade to mark ${additionalPapers > 1 ? `${additionalPapers} more` : "more"}.`,
		)
	}
}

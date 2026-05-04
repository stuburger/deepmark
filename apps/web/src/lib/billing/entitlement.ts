import { db } from "@/lib/db"

import {
	type Entitlement,
	decideEntitlement,
	decideQuotaCheck,
} from "./entitlement-decision"
import { getSharedBalance } from "./ledger"
import { InsufficientBalanceError } from "./types"

/**
 * Impure orchestrator: fetches user + ledger state and routes through the
 * pure decision functions in `./entitlement-decision`. Two entry points:
 *  - `getEntitlement(userId)` — returns the Entitlement union for UI
 *  - `assertPapersQuota({user, additionalPapers})` — pre-flight check that
 *    throws on insufficient balance
 */

/**
 * Resolve the user's marking entitlement. Cheap path first — admin and
 * uncapped users skip the balance read entirely. Metered users incur one
 * indexed SUM aggregate against the ledger.
 */
export async function getEntitlement(userId: string): Promise<Entitlement> {
	const user = await db.user.findUnique({
		where: { id: userId },
		select: { role: true, plan: true, subscription_status: true },
	})
	if (!user) {
		// Unknown user — treat as fresh metered with zero balance. Defensive:
		// shouldn't happen for an authenticated session, but covers the gap if
		// a user row is deleted while a session token still exists.
		return decideEntitlement({ user: null, balance: 0 })
	}
	const decision = decideEntitlement({ user, balance: 0 })
	if (decision.kind !== "metered") return decision
	const balance = await getSharedBalance(userId)
	return { kind: "metered", balance, plan: decision.plan }
}

/**
 * Pre-flight assertion: throws `InsufficientBalanceError` if the user can't
 * cover `additionalPapers` from their available balance. Pure check, no
 * write — the actual ledger consume is reserved atomically alongside the
 * StudentSubmission + GradingRun creation in commit-service / re-mark /
 * re-scan, so a double-submit race can't over-spend (the second submit's
 * consume insert hits the same balance and fails the check).
 *
 * Used by:
 *  - the `markingAction` middleware (additionalPapers = 1)
 *  - the batch-commit action (additionalPapers = staged-script count)
 *  - re-mark / re-scan single-script actions (additionalPapers = 1)
 *
 * The reserve-on-submit consume insert is the source of truth for "does
 * this user have credit?" — this assertion is a fast-fail to avoid doing
 * work that the consume insert would reject anyway.
 */
export async function assertPapersQuota({
	user,
	additionalPapers,
}: {
	user: { id: string }
	additionalPapers: number
}): Promise<void> {
	const ent = await getEntitlement(user.id)
	const decision = decideQuotaCheck({ entitlement: ent, additionalPapers })
	if (decision.ok) return
	throw new InsufficientBalanceError(
		decision.balance,
		decision.requested,
		decision.plan,
	)
}

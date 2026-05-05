import Link from "next/link"

import { auth } from "@/lib/auth"
import { getEntitlement } from "@/lib/billing/entitlement"
import { getCurrentPeriodUsage } from "@/lib/billing/ledger"
import { TRIAL_PAPER_CAP } from "@/lib/billing/types"

/**
 * Persistent in-app paper-balance nudge. Renders nothing for admins or
 * uncapped subscribers (Unlimited). Surfaces in three modes:
 *
 *  - Trial / PPU-only (`ent.kind === "metered"`, no plan):
 *      shows balance with escalating tone (>5 muted, ≤5 amber, 0 red)
 *  - Capped Pro at ≥80% of monthly grant:
 *      shows "47 of 60 used this month" with a Top up CTA → /teacher/settings/billing
 *  - Capped Pro at cap (consumed >= grant) AND no extras:
 *      red banner forcing the cap-bite UX
 *
 * Capped Pro users at <80% see nothing — the billing page meter is the
 * proper surface; a persistent banner would be permanent visual noise.
 */
export async function TrialBanner() {
	const session = await auth()
	if (!session) return null

	const ent = await getEntitlement(session.userId)
	if (ent.kind === "admin" || ent.kind === "uncapped") return null

	// Capped Pro: render only when approaching/at the cap.
	if (ent.plan === "pro_monthly") {
		return await ProCapBanner(session.userId, ent.balance)
	}

	return <TrialOrPpuBanner balance={ent.balance} />
}

function TrialOrPpuBanner({ balance }: { balance: number }) {
	const exhausted = balance <= 0

	const tone = exhausted
		? "border-error-500/40 bg-error-500/10 text-error-700 dark:text-error-300"
		: balance <= 5
			? "border-warning-500/40 bg-warning-500/10 text-warning-700 dark:text-warning-200"
			: "border-border/60 bg-muted/40 text-foreground/80"

	const headline = exhausted
		? "Out of papers — buy a set or subscribe to keep marking."
		: balance <= 5
			? `${balance} ${balance === 1 ? "paper" : "papers"} remaining.`
			: balance > TRIAL_PAPER_CAP
				? `${balance} papers remaining (PPU credit).`
				: `Free trial · ${balance} of ${TRIAL_PAPER_CAP} papers remaining.`

	return (
		<div className={`border-b text-sm ${tone}`}>
			<div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2">
				<span className="font-medium">{headline}</span>
				<Link
					href="/pricing"
					className="rounded-md border border-current/30 px-3 py-1 text-xs font-semibold transition-colors hover:bg-current/10"
				>
					{exhausted ? "Upgrade now" : "Upgrade"}
				</Link>
			</div>
		</div>
	)
}

async function ProCapBanner(userId: string, totalBalance: number) {
	const usage = await getCurrentPeriodUsage(userId)
	if (!usage) return null

	const remainingInPeriod = Math.max(0, usage.grantSize - usage.consumed)
	const usedFraction = usage.consumed / usage.grantSize
	const atCap = remainingInPeriod === 0
	// Only nag when the Pro user is meaningfully close — < 80% used means
	// no banner. The billing-page meter is the proper surface for status.
	if (!atCap && usedFraction < 0.8) return null

	// "Extras" = PPU / top-up / admin credits on top of the period grant.
	// If the user has plenty in extras the cap-bite framing is wrong — they
	// can keep marking from the cross-period pool.
	const extras = Math.max(0, totalBalance - remainingInPeriod)
	if (atCap && extras > 0) return null

	const tone = atCap
		? "border-error-500/40 bg-error-500/10 text-error-700 dark:text-error-300"
		: "border-warning-500/40 bg-warning-500/10 text-warning-700 dark:text-warning-200"

	const headline = atCap
		? `Monthly cap hit — top up to keep marking until ${formatPeriodEnd(usage.periodEndsAt)}.`
		: `${usage.consumed} of ${usage.grantSize} papers used this month.`

	return (
		<div className={`border-b text-sm ${tone}`}>
			<div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2">
				<span className="font-medium">{headline}</span>
				<Link
					href="/teacher/settings/billing"
					className="rounded-md border border-current/30 px-3 py-1 text-xs font-semibold transition-colors hover:bg-current/10"
				>
					Top up
				</Link>
			</div>
		</div>
	)
}

function formatPeriodEnd(date: Date | null): string {
	if (!date) return "the next renewal"
	return date.toLocaleDateString("en-GB", { day: "numeric", month: "long" })
}

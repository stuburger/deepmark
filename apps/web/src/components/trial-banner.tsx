import Link from "next/link"

import { auth } from "@/lib/auth"
import { getEntitlement } from "@/lib/billing/entitlement"

/**
 * Persistent in-app trial nudge. Renders nothing for admins and active paid
 * users. For trial users it shows a count + upgrade CTA, escalating tone:
 *  - lots of papers left  → muted info
 *  - <= 5 left           → amber warning
 *  - 0 left              → red, paywall framing
 */
export async function TrialBanner() {
	const session = await auth()
	if (!session) return null

	const ent = await getEntitlement(session.userId)
	if (ent.kind !== "trial") return null

	const { used, cap, remaining, exhausted } = ent

	const tone = exhausted
		? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
		: remaining <= 5
			? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200"
			: "border-border/60 bg-muted/40 text-foreground/80"

	const headline = exhausted
		? "Trial complete — upgrade to keep marking."
		: remaining <= 5
			? `${remaining} of ${cap} trial ${remaining === 1 ? "paper" : "papers"} left.`
			: `Free trial · ${used} of ${cap} papers used.`

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

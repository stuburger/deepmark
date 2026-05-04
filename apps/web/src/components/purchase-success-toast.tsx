"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect } from "react"
import { toast } from "sonner"

/**
 * Mount-effect that surfaces a toast for `?ppu=success`, `?topup=success`,
 * and `?topup=canceled` — all three are set by the Stripe Checkout return
 * URLs in `lib/billing/checkout-payment.ts`. After firing the toast we strip
 * the param via `router.replace`, so a refresh doesn't re-fire (and so the
 * URL the user shares / bookmarks is clean).
 *
 * Mounted once in the teacher layout: covers `/teacher` (PPU return),
 * `/teacher/billing` (top-up from the billing page), and the exam-paper
 * pages (top-up from the cap-bite modal). Also no-ops on client navigations
 * because the param disappears after the first effect run.
 *
 * The success toasts say "credited shortly" rather than "credited" — the
 * Stripe webhook fulfilment is async and may not have landed yet (the user
 * lands here off Stripe's redirect, not our DB write). Banner / billing
 * meter will catch up when the webhook fires.
 */
export function PurchaseSuccessToast() {
	const router = useRouter()
	const pathname = usePathname()
	const params = useSearchParams()
	const ppu = params.get("ppu")
	const topup = params.get("topup")

	// `params` (URLSearchParams) has unstable identity across renders, so we
	// snapshot its serialised form for the strip-and-replace step and leave it
	// out of the deps array. The values we actually branch on (ppu / topup)
	// are captured directly.
	const paramsString = params.toString()
	useEffect(() => {
		if (!ppu && !topup) return
		if (ppu === "success") {
			toast.success("Set purchased — papers will be credited shortly.")
		} else if (topup === "success") {
			toast.success("Top-up complete — papers will be credited shortly.")
		} else if (topup === "canceled") {
			toast.info("Top-up canceled.")
		} else {
			return
		}

		// Strip the consumed params, preserve any others the page cares about.
		const next = new URLSearchParams(paramsString)
		next.delete("ppu")
		next.delete("topup")
		const query = next.toString()
		router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
	}, [ppu, topup, pathname, paramsString, router])

	return null
}

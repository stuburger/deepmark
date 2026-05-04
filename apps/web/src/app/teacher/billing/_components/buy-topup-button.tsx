"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { createTopUpCheckoutSession } from "@/lib/billing/checkout-payment"
import { surfaceMarkingError } from "@/lib/billing/error-toast"
import type { Currency } from "@/lib/billing/types"

type Props = {
	currency: Currency
	priceLabel: string
	papersPerPurchase: number
	/**
	 * Where to send the user after the Stripe Checkout redirect. Defaults to
	 * the billing page; cap-bite modals override with the marking surface.
	 */
	returnPath?: string
	variant?: "default" | "outline"
}

export function BuyTopUpButton(props: Props) {
	const [pending, setPending] = useState(false)

	async function startCheckout() {
		setPending(true)
		const result = await createTopUpCheckoutSession({
			currency: props.currency,
			returnPath: props.returnPath ?? "/teacher/billing",
		})
		if (result?.serverError) {
			surfaceMarkingError(result.serverError)
			setPending(false)
			return
		}
		const url = result?.data?.url
		if (!url) {
			surfaceMarkingError("Could not start checkout. Please try again.")
			setPending(false)
			return
		}
		window.location.assign(url)
	}

	return (
		<Button
			onClick={startCheckout}
			disabled={pending}
			variant={props.variant ?? "default"}
		>
			{pending
				? "Starting checkout…"
				: `Buy a top-up — ${props.priceLabel} (${props.papersPerPurchase} papers)`}
		</Button>
	)
}

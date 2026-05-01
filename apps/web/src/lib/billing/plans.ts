import { Resource } from "sst"

import type { Currency, Interval, PlanId } from "./types"

export type ResolvedPrice = {
	planId: PlanId
	priceId: string
	amount: number
	currency: Currency
	interval: Interval
}

/**
 * Resolve a Stripe Price by currency + interval, reading the linked
 * StripeConfig. Throws if the combination is missing — every published
 * combination must exist in `infra/billing.ts` before we surface it in the UI.
 */
export function resolvePrice(
	currency: Currency,
	interval: Interval,
): ResolvedPrice {
	const prices = Resource.StripeConfig.plans.pro.prices[currency]
	const slot = interval === "monthly" ? prices.monthly : prices.annual
	if (!slot.id) {
		throw new Error(
			`No Stripe price configured for pro/${currency}/${interval}`,
		)
	}
	return {
		planId: interval === "monthly" ? "pro_monthly" : "pro_annual",
		priceId: slot.id,
		amount: slot.amount,
		currency,
		interval,
	}
}

/** Both intervals for a currency — used to render the pricing cards. */
export function priceTiers(currency: Currency): {
	monthly: ResolvedPrice
	annual: ResolvedPrice
} {
	return {
		monthly: resolvePrice(currency, "monthly"),
		annual: resolvePrice(currency, "annual"),
	}
}

/**
 * Format an integer minor-unit amount for display.
 *  2900  GBP → "£29"
 *  31200 GBP → "£312"
 *  1450  GBP → "£14.50"   (founders 50%-off can produce halves)
 *  3500  USD → "$35"
 * Shows decimals only when the value isn't whole — keeps round prices clean
 * but doesn't silently misrepresent halves.
 */
export function formatPrice(amount: number, currency: Currency): string {
	const symbol = currency === "gbp" ? "£" : "$"
	const value = amount / 100
	const isWhole = Number.isInteger(value)
	return `${symbol}${value.toLocaleString("en", {
		minimumFractionDigits: isWhole ? 0 : 2,
		maximumFractionDigits: 2,
	})}`
}

import { Resource } from "sst"

import type { Currency, Interval, PlanId, PlanKind } from "./types"

export type ResolvedPrice = {
	planId: PlanId
	priceId: string
	amount: number
	currency: Currency
	interval: Interval
}

/**
 * Resolve a Stripe Price by plan + currency + interval, reading the linked
 * StripeConfig. Throws if the combination is missing — every published
 * combination must exist in `infra/billing.ts` before we surface it in the
 * UI. Unlimited only ships monthly; passing `interval: "annual"` for it
 * throws.
 */
export function resolvePrice(
	kind: PlanKind,
	currency: Currency,
	interval: Interval,
): ResolvedPrice {
	if (kind === "pro") {
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
	if (interval !== "monthly") {
		throw new Error(`Unlimited is monthly-only — got ${interval}`)
	}
	const slot = Resource.StripeConfig.plans.unlimited.prices[currency].monthly
	if (!slot.id) {
		throw new Error(`No Stripe price configured for unlimited/${currency}`)
	}
	return {
		planId: "unlimited_monthly",
		priceId: slot.id,
		amount: slot.amount,
		currency,
		interval: "monthly",
	}
}

/** Both Pro intervals for a currency — used to render the Pro pricing card. */
export function priceTiers(currency: Currency): {
	monthly: ResolvedPrice
	annual: ResolvedPrice
} {
	return {
		monthly: resolvePrice("pro", currency, "monthly"),
		annual: resolvePrice("pro", currency, "annual"),
	}
}

/**
 * Format an integer minor-unit amount for display.
 *  2400  GBP → "£24"
 *  25900 GBP → "£259"
 *  1200  GBP → "£12"      (founders 50%-off — falls on a whole here)
 *  3000  USD → "$30"
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

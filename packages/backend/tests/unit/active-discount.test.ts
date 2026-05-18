import type Stripe from "stripe"
import { describe, expect, it } from "vitest"

import { stripeToActiveDiscount } from "../../src/billing/active-discount"

type Coupon = Partial<Stripe.Coupon>
/** Discount-shaped fake — Stripe v22 nests the coupon under `source.coupon`. */
type Discount = {
	start?: number
	end?: number | null
	source?: { coupon: Coupon | string | null; type: "coupon" }
}

function makeSubscription(overrides: {
	priceUnitAmount?: number | null
	currency?: string
	interval?: "month" | "year" | "week"
	intervalCount?: number
	currentPeriodEnd?: number
	discount?: Discount | null
	discountsArray?: Discount[]
}): Stripe.Subscription {
	const {
		priceUnitAmount = 2400,
		currency = "gbp",
		interval = "month",
		intervalCount = 1,
		currentPeriodEnd,
		discount,
		discountsArray,
	} = overrides

	const item = {
		current_period_end: currentPeriodEnd,
		price: {
			unit_amount: priceUnitAmount,
			currency,
			recurring: { interval, interval_count: intervalCount },
		},
	}

	const sub: Record<string, unknown> = {
		id: "sub_test",
		currency,
		items: { data: [item] },
	}
	if (discount !== undefined) sub.discount = discount
	if (discountsArray !== undefined) sub.discounts = discountsArray

	return sub as unknown as Stripe.Subscription
}

function makeDiscount(args: {
	coupon: Coupon
	start?: number
	end?: number | null
}): Discount {
	return {
		start: args.start,
		end: args.end,
		source: { coupon: args.coupon, type: "coupon" },
	}
}

describe("stripeToActiveDiscount", () => {
	it("returns null when no discount is attached", () => {
		const sub = makeSubscription({ discount: null })
		expect(stripeToActiveDiscount(sub)).toBeNull()
	})

	it("maps a 40% repeating coupon (founders) to the right amount and end date", () => {
		const start = Math.floor(new Date("2026-05-06T00:00:00Z").getTime() / 1000)
		const end = Math.floor(new Date("2026-11-06T00:00:00Z").getTime() / 1000)
		const sub = makeSubscription({
			priceUnitAmount: 2400,
			currency: "gbp",
			discount: makeDiscount({
				start,
				end,
				coupon: {
					duration: "repeating",
					duration_in_months: 6,
					percent_off: 40,
				},
			}),
		})
		const result = stripeToActiveDiscount(sub)
		expect(result).not.toBeNull()
		expect(result?.amountOff).toBe(1440)
		expect(result?.standardAmount).toBe(2400)
		expect(result?.currency).toBe("gbp")
		expect(result?.endsAt?.toISOString()).toBe("2026-11-06T00:00:00.000Z")
	})

	it("maps a forever coupon to a null endsAt", () => {
		const sub = makeSubscription({
			priceUnitAmount: 2400,
			discount: makeDiscount({
				coupon: { duration: "forever", percent_off: 25 },
			}),
		})
		const result = stripeToActiveDiscount(sub)
		expect(result?.endsAt).toBeNull()
		expect(result?.amountOff).toBe(1800)
	})

	it("maps a once coupon to the current period end", () => {
		const periodEnd = Math.floor(
			new Date("2026-06-06T00:00:00Z").getTime() / 1000,
		)
		const sub = makeSubscription({
			priceUnitAmount: 2400,
			currentPeriodEnd: periodEnd,
			discount: makeDiscount({
				coupon: { duration: "once", percent_off: 50 },
			}),
		})
		const result = stripeToActiveDiscount(sub)
		expect(result?.endsAt?.toISOString()).toBe("2026-06-06T00:00:00.000Z")
		expect(result?.amountOff).toBe(1200)
	})

	it("flattens annual prices to a monthly amount", () => {
		const sub = makeSubscription({
			priceUnitAmount: 25900, // £259/year
			interval: "year",
			discount: makeDiscount({
				coupon: { duration: "forever", percent_off: 0 },
			}),
		})
		const result = stripeToActiveDiscount(sub)
		expect(result?.standardAmount).toBe(2158)
		expect(result?.amountOff).toBe(2158)
	})

	it("uses discounts[] when discount field is missing", () => {
		const sub = makeSubscription({
			priceUnitAmount: 2400,
			discountsArray: [
				makeDiscount({
					coupon: { duration: "forever", percent_off: 10 },
				}),
			],
		})
		const result = stripeToActiveDiscount(sub)
		expect(result?.amountOff).toBe(2160)
	})

	it("supports amount_off coupons", () => {
		const sub = makeSubscription({
			priceUnitAmount: 2400,
			discount: makeDiscount({
				coupon: {
					duration: "forever",
					amount_off: 500,
					currency: "gbp",
				},
			}),
		})
		const result = stripeToActiveDiscount(sub)
		expect(result?.amountOff).toBe(1900)
	})

	it("returns null when the coupon is unexpanded (string id only)", () => {
		const sub = makeSubscription({
			priceUnitAmount: 2400,
			discount: { source: { coupon: "co_test", type: "coupon" } },
		})
		expect(stripeToActiveDiscount(sub)).toBeNull()
	})

	it("returns null when the price has no unit amount", () => {
		const sub = makeSubscription({
			priceUnitAmount: null,
			discount: makeDiscount({
				coupon: { duration: "forever", percent_off: 40 },
			}),
		})
		expect(stripeToActiveDiscount(sub)).toBeNull()
	})

	it("returns null when neither percent_off nor amount_off is set", () => {
		const sub = makeSubscription({
			discount: makeDiscount({
				coupon: { duration: "forever" },
			}),
		})
		expect(stripeToActiveDiscount(sub)).toBeNull()
	})
})

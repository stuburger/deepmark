import type { ActiveDiscount } from "@mcp-gcse/emails"
import type Stripe from "stripe"

/**
 * Map a Stripe.Subscription's active discount onto our `ActiveDiscount`
 * shape.
 *
 * Discount-agnostic: any Stripe coupon (founders, back-to-school, MAT
 * bulk discount, anything we run in future) flows through this same code
 * path. The email template renders "until 5 November 2026, then £24/mo"
 * automatically; we never hard-code the founders branding in the email path.
 *
 * Returns `null` when:
 *   - The subscription has no `discount` attached.
 *   - The discount is missing critical pricing data.
 *   - The standard amount can't be resolved from the subscription's first
 *     line-item price (e.g. a metered or free Price slipped into the sub).
 *
 * Pure — no SDK calls, no DB. Tested with table-driven Stripe-shaped fakes.
 */
export function stripeToActiveDiscount(
	subscription: Stripe.Subscription,
): ActiveDiscount | null {
	const discount = readActiveDiscount(subscription)
	if (!discount) return null

	const coupon = readCoupon(discount)
	if (!coupon) return null

	const standardAmount = readStandardMonthlyAmount(subscription)
	const currency = readCurrency(subscription)
	if (standardAmount === null || !currency) return null

	const discounted = applyCoupon(standardAmount, coupon)
	if (discounted === null) return null

	return {
		amountOff: discounted,
		standardAmount,
		currency: currency.toLowerCase(),
		endsAt: discountEndDate(discount, coupon, subscription),
	}
}

function readActiveDiscount(
	subscription: Stripe.Subscription,
): Stripe.Discount | null {
	// Stripe v22: `subscription.discounts` is `Array<string | Discount>`
	// (multiple coupons can stack); we take the first expanded one. Older
	// API versions exposed a single `subscription.discount` field; we still
	// read it as a fallback in case a webhook delivery uses that shape.
	type SubWithLegacyDiscount = Stripe.Subscription & {
		discount?: Stripe.Discount | null
	}
	const list = subscription.discounts
	if (Array.isArray(list)) {
		for (const item of list) {
			if (item && typeof item !== "string") return item
		}
	}
	const legacy = (subscription as SubWithLegacyDiscount).discount
	if (legacy && typeof legacy !== "string") return legacy
	return null
}

function readCoupon(discount: Stripe.Discount): Stripe.Coupon | null {
	// Stripe v22 nested the coupon under `discount.source.coupon` (it can
	// also be a string id when not expanded — we need an expanded coupon
	// to read percent_off / amount_off / duration, so a bare string returns
	// null and the caller falls back to "no discount line").
	const coupon = discount.source?.coupon
	if (!coupon || typeof coupon === "string") return null
	return coupon
}

function readStandardMonthlyAmount(
	subscription: Stripe.Subscription,
): number | null {
	const item = subscription.items.data[0]
	const price = item?.price
	if (!price) return null
	if (price.unit_amount == null) return null
	// Annual prices flatten back to monthly for the discount line so the
	// email reads "£14.40/month" rather than "£172.80/year". 12 is the
	// only divisor we currently use; quarterly Stripe prices would need
	// a similar mapping if we ever sell them.
	const interval = price.recurring?.interval
	const intervalCount = price.recurring?.interval_count ?? 1
	if (interval === "year") {
		return Math.round(price.unit_amount / (12 * intervalCount))
	}
	if (interval === "month") {
		return Math.round(price.unit_amount / intervalCount)
	}
	if (interval === "week") {
		return Math.round((price.unit_amount * 52) / 12 / intervalCount)
	}
	return price.unit_amount
}

function readCurrency(subscription: Stripe.Subscription): string | null {
	const item = subscription.items.data[0]
	const currency = subscription.currency ?? item?.price?.currency ?? null
	return currency ?? null
}

function applyCoupon(
	standardAmount: number,
	coupon: Stripe.Coupon,
): number | null {
	if (coupon.percent_off != null) {
		const factor = (100 - coupon.percent_off) / 100
		return Math.round(standardAmount * factor)
	}
	if (coupon.amount_off != null) {
		return Math.max(0, standardAmount - coupon.amount_off)
	}
	return null
}

function discountEndDate(
	discount: Stripe.Discount,
	coupon: Stripe.Coupon,
	subscription: Stripe.Subscription,
): Date | null {
	switch (coupon.duration) {
		case "forever":
			return null
		case "once": {
			// `once` discounts apply to one invoice only. The end of the
			// current period is the right answer for the welcome email.
			const periodEndUnix = subscription.items.data[0]?.current_period_end
			return periodEndUnix ? new Date(periodEndUnix * 1000) : null
		}
		case "repeating": {
			if (typeof discount.end === "number") {
				return new Date(discount.end * 1000)
			}
			const months = coupon.duration_in_months
			if (typeof months === "number" && discount.start) {
				return addMonths(new Date(discount.start * 1000), months)
			}
			return null
		}
		default:
			return null
	}
}

function addMonths(start: Date, months: number): Date {
	const result = new Date(start)
	result.setUTCMonth(result.getUTCMonth() + months)
	return result
}

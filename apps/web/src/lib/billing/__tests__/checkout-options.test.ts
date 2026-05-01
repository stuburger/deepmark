import { describe, expect, it } from "vitest"

import {
	buildCheckoutSessionParams,
	decideCheckoutCouponOrPromo,
} from "../checkout-options"

describe("decideCheckoutCouponOrPromo", () => {
	it("attaches the founders coupon when slots remain", () => {
		const result = decideCheckoutCouponOrPromo({
			foundersAvailable: true,
			couponId: "co_founders",
		})
		expect(result).toEqual({ discounts: [{ coupon: "co_founders" }] })
	})

	it("allows promotion codes when founders are sold out", () => {
		const result = decideCheckoutCouponOrPromo({
			foundersAvailable: false,
			couponId: "co_founders",
		})
		expect(result).toEqual({ allow_promotion_codes: true })
	})

	it("never returns both keys (Stripe rejects sessions that combine them)", () => {
		// The original bug: setting `allow_promotion_codes: false` alongside
		// `discounts: [...]` made Stripe reject the Checkout Session with
		// "You may only specify one of these parameters".
		for (const foundersAvailable of [true, false]) {
			const result = decideCheckoutCouponOrPromo({
				foundersAvailable,
				couponId: "co_test",
			})
			const keys = Object.keys(result)
			expect(keys).toHaveLength(1)
			expect(
				keys.includes("discounts") !== keys.includes("allow_promotion_codes"),
			).toBe(true)
		}
	})
})

describe("buildCheckoutSessionParams", () => {
	const base = {
		customerId: "cus_123",
		priceId: "price_abc",
		successUrl: "https://example.com/teacher/mark?upgraded=1",
		cancelUrl: "https://example.com/pricing?canceled=1",
		userId: "user_xyz",
		planId: "pro_monthly" as const,
	}

	it("builds a subscription session with a single line item", () => {
		const params = buildCheckoutSessionParams({
			...base,
			couponOrPromo: { allow_promotion_codes: true },
		})
		expect(params.mode).toBe("subscription")
		expect(params.customer).toBe("cus_123")
		expect(params.line_items).toEqual([{ price: "price_abc", quantity: 1 }])
	})

	it("threads the founders coupon into discounts", () => {
		const params = buildCheckoutSessionParams({
			...base,
			couponOrPromo: { discounts: [{ coupon: "co_founders" }] },
		})
		expect(params.discounts).toEqual([{ coupon: "co_founders" }])
		expect(params.allow_promotion_codes).toBeUndefined()
	})

	it("threads allow_promotion_codes when no coupon is attached", () => {
		const params = buildCheckoutSessionParams({
			...base,
			couponOrPromo: { allow_promotion_codes: true },
		})
		expect(params.allow_promotion_codes).toBe(true)
		expect(params.discounts).toBeUndefined()
	})

	it("propagates success/cancel URLs verbatim", () => {
		const params = buildCheckoutSessionParams({
			...base,
			couponOrPromo: { allow_promotion_codes: true },
		})
		expect(params.success_url).toBe(base.successUrl)
		expect(params.cancel_url).toBe(base.cancelUrl)
	})

	it("attaches user_id + plan to subscription_data.metadata", () => {
		const params = buildCheckoutSessionParams({
			...base,
			couponOrPromo: { allow_promotion_codes: true },
		})
		expect(params.subscription_data?.metadata).toEqual({
			user_id: "user_xyz",
			plan: "pro_monthly",
		})
	})
})

import type Stripe from "stripe"

/**
 * Stripe Checkout Session options for "how should the customer get a
 * discount?". Mutually exclusive at the API level — Stripe rejects sessions
 * that include both `discounts` and `allow_promotion_codes` keys (even when
 * allow_promotion_codes is false). The discriminated shape ensures we only
 * ever send one.
 */
export type CouponOrPromo =
	| { discounts: Array<{ coupon: string }> }
	| { allow_promotion_codes: true }

/**
 * Decide which Checkout option to attach. Founders' slot still open →
 * auto-attach the founders coupon. Otherwise → allow customers to enter a
 * promo code at checkout (so we can hand out codes later if we want).
 */
export function decideCheckoutCouponOrPromo(args: {
	foundersAvailable: boolean
	couponId: string
}): CouponOrPromo {
	return args.foundersAvailable
		? { discounts: [{ coupon: args.couponId }] }
		: { allow_promotion_codes: true }
}

/**
 * Pure builder for the Stripe Checkout Session create params. Pulls all the
 * shape-of-the-payload concerns into one place that's easy to test and easy
 * to evolve when we add line items, tax behaviour, locales, etc.
 *
 * `subscription_data.metadata` carries `user_id` + `plan` so the webhook
 * handler can identify the user and apply the right plan label without
 * another round-trip.
 */
export function buildCheckoutSessionParams(args: {
	customerId: string
	priceId: string
	couponOrPromo: CouponOrPromo
	successUrl: string
	cancelUrl: string
	userId: string
	planId: string
}): Stripe.Checkout.SessionCreateParams {
	return {
		mode: "subscription",
		customer: args.customerId,
		line_items: [{ price: args.priceId, quantity: 1 }],
		...args.couponOrPromo,
		success_url: args.successUrl,
		cancel_url: args.cancelUrl,
		subscription_data: {
			metadata: {
				user_id: args.userId,
				plan: args.planId,
			},
		},
	}
}

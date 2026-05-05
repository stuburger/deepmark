"use server"

import { Resource } from "sst"
import { z } from "zod"

import { authenticatedAction } from "@/lib/authz"

import {
	buildCheckoutSessionParams,
	decideCheckoutCouponOrPromo,
} from "./checkout-options"
import { foundersAvailable } from "./founders"
import { resolvePrice } from "./plans"
import { stripeClient } from "./stripe-client"
import { ensureStripeCustomer } from "./stripe-customer"

const createCheckoutSessionInput = z.object({
	kind: z.enum(["pro", "unlimited"]),
	currency: z.enum(["gbp", "usd"]),
	interval: z.enum(["monthly", "annual"]),
})

/**
 * Create a Stripe Checkout session for the signed-in user. Auth wrapper +
 * four delegating calls: resolve-price, ensure-customer, decide-coupon,
 * build-and-call. Each piece is its own testable unit.
 *
 * The founders coupon is Pro-only (per `infra/billing.ts` — we want the £49
 * Unlimited ceiling to anchor Pro's value). Unlimited always falls back to
 * `allow_promotion_codes: true` so we can hand out manual codes if needed.
 */
export const createCheckoutSession = authenticatedAction
	.inputSchema(createCheckoutSessionInput)
	.action(async ({ parsedInput, ctx }) => {
		const { kind, currency, interval } = parsedInput
		const price = resolvePrice(kind, currency, interval)

		const customerId = await ensureStripeCustomer({
			userId: ctx.user.id,
			email: ctx.user.email,
		})

		const couponOrPromo =
			kind === "pro"
				? decideCheckoutCouponOrPromo({
						foundersAvailable: await foundersAvailable(),
						couponId: Resource.StripeConfig.foundersCouponId,
					})
				: ({ allow_promotion_codes: true } as const)

		const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://getdeepmark.com"
		const params = buildCheckoutSessionParams({
			customerId,
			priceId: price.priceId,
			couponOrPromo,
			successUrl: `${baseUrl}/teacher/mark?upgraded=1`,
			cancelUrl: `${baseUrl}/pricing?canceled=1`,
			userId: ctx.user.id,
			planId: price.planId,
		})

		const session = await stripeClient().checkout.sessions.create(params)
		if (!session.url) {
			throw new Error("Stripe did not return a checkout URL")
		}
		return { url: session.url }
	})

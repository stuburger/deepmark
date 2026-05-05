"use server"

import { Resource } from "sst"
import { z } from "zod"

import { authenticatedAction } from "@/lib/authz"

import { stripeClient } from "./stripe-client"
import { ensureStripeCustomer } from "./stripe-customer"

/**
 * One-off checkout flows: PPU sets and Pro top-ups. Both ride
 * `mode: "payment"` (vs the subscription flow in `./checkout.ts`). The
 * webhook handler `applyCompletedCheckoutSession` reads `metadata.kind` to
 * decide which ledger row to insert.
 *
 * Distinct server actions because the trigger surfaces differ — PPU has its
 * own card on the public pricing page; top-up only ever fires from in-app
 * upsells (billing page, cap-bite modal). Different `success_url` / context
 * but otherwise identical mechanics.
 */

const ppuInput = z.object({
	currency: z.enum(["gbp", "usd"]),
})

/**
 * Create a Stripe Checkout session for a PPU set (£10 / $13, 30 papers).
 * Success returns the user to /teacher with a notice; cancel sends them
 * back to /pricing.
 */
export const createPpuCheckoutSession = authenticatedAction
	.inputSchema(ppuInput)
	.action(async ({ parsedInput, ctx }) => {
		const { currency } = parsedInput
		const price = Resource.StripeConfig.ppu[currency]

		const customerId = await ensureStripeCustomer({
			userId: ctx.user.id,
			email: ctx.user.email,
		})

		const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://getdeepmark.com"

		const session = await stripeClient().checkout.sessions.create({
			mode: "payment",
			customer: customerId,
			line_items: [{ price: price.id, quantity: 1 }],
			success_url: `${baseUrl}/teacher?ppu=success`,
			cancel_url: `${baseUrl}/pricing?canceled=1`,
			metadata: {
				kind: "ppu",
				user_id: ctx.user.id,
			},
			payment_intent_data: {
				metadata: {
					kind: "ppu",
					user_id: ctx.user.id,
				},
			},
		})
		if (!session.url) {
			throw new Error("Stripe did not return a checkout URL")
		}
		return { url: session.url }
	})

const topUpInput = z.object({
	currency: z.enum(["gbp", "usd"]),
	// Where to send the user after they complete (or cancel) the top-up. Lets
	// the cap-bite modal land them back mid-marking, the billing page button
	// land them back on /teacher/settings/billing, etc.
	returnPath: z
		.string()
		.regex(/^\//, "returnPath must start with '/'")
		.max(200)
		.default("/teacher/settings/billing"),
})

/**
 * Create a Stripe Checkout session for a Pro top-up (£6.50 / $8.50,
 * 15 papers). In-app only — there's no public pricing page surface for this.
 *
 * `returnPath` is interpolated into both success_url and cancel_url so the
 * user lands back in the surface they triggered the upsell from.
 */
export const createTopUpCheckoutSession = authenticatedAction
	.inputSchema(topUpInput)
	.action(async ({ parsedInput, ctx }) => {
		const { currency, returnPath } = parsedInput
		const price = Resource.StripeConfig.topUp[currency]

		const customerId = await ensureStripeCustomer({
			userId: ctx.user.id,
			email: ctx.user.email,
		})

		const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://getdeepmark.com"

		const session = await stripeClient().checkout.sessions.create({
			mode: "payment",
			customer: customerId,
			line_items: [{ price: price.id, quantity: 1 }],
			success_url: `${baseUrl}${returnPath}?topup=success`,
			cancel_url: `${baseUrl}${returnPath}?topup=canceled`,
			metadata: {
				kind: "topup",
				user_id: ctx.user.id,
			},
			payment_intent_data: {
				metadata: {
					kind: "topup",
					user_id: ctx.user.id,
				},
			},
		})
		if (!session.url) {
			throw new Error("Stripe did not return a checkout URL")
		}
		return { url: session.url }
	})

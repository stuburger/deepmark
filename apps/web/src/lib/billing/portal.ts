"use server"

import { authenticatedAction } from "@/lib/authz"
import { db } from "@/lib/db"

import { stripeClient } from "./stripe-client"

/**
 * Open a Stripe Customer Portal session for the signed-in user — they manage
 * payment method, invoices, plan changes, and cancellation in Stripe's hosted
 * UI. Requires the user to already have a `stripe_customer_id` (set on first
 * checkout). Returns the URL; client window.location.assign's to it.
 */
export const createBillingPortalSession = authenticatedAction.action(
	async ({ ctx }) => {
		const user = await db.user.findUniqueOrThrow({
			where: { id: ctx.user.id },
			select: { stripe_customer_id: true },
		})
		if (!user.stripe_customer_id) {
			throw new Error(
				"No subscription on file. Subscribe first to manage billing.",
			)
		}

		const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://getdeepmark.com"
		const session = await stripeClient().billingPortal.sessions.create({
			customer: user.stripe_customer_id,
			return_url: `${baseUrl}/teacher/settings/billing`,
		})

		return { url: session.url }
	},
)

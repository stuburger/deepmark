import { db } from "@/lib/db"

import { stripeClient } from "./stripe-client"

/**
 * Find-or-create the Stripe Customer record for this user. On miss, creates
 * the customer in Stripe and persists the id back to `User.stripe_customer_id`
 * so subsequent checkouts reuse it — keeps invoices, payment methods, and
 * the founders' coupon coupled to one ledger entry per user.
 *
 * Race-tolerance: concurrent first-time calls (rare — checkout is one user
 * click) may create duplicate Stripe customers. The DB write is single-winner
 * via the `stripe_customer_id` unique constraint; cleaning up the orphan
 * Stripe customer would need a webhook-driven sweep. Not worth solving
 * pre-emptively.
 */
export async function ensureStripeCustomer(args: {
	userId: string
	email: string | null
}): Promise<string> {
	const existing = await db.user.findUniqueOrThrow({
		where: { id: args.userId },
		select: { stripe_customer_id: true },
	})
	if (existing.stripe_customer_id) return existing.stripe_customer_id

	const customer = await stripeClient().customers.create({
		email: args.email ?? undefined,
		metadata: { user_id: args.userId },
	})
	await db.user.update({
		where: { id: args.userId },
		data: { stripe_customer_id: customer.id },
	})
	return customer.id
}

import type Stripe from "stripe"

/**
 * Extract the customer id from a Stripe object whose `customer` field may
 * be a string id, an expanded Customer/DeletedCustomer object, or absent.
 * Pure — no SDK calls, no narrowing assumptions beyond the type union.
 */
export function extractCustomerId(
	raw: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
	if (!raw) return null
	return typeof raw === "string" ? raw : raw.id
}

/** Shape of the User row we write when a subscription event arrives. */
export type SubscriptionUpdate = {
	stripe_customer_id: string
	stripe_subscription_id: string
	subscription_status: string
	plan: string | null
	current_period_end: Date | null
}

/**
 * Translate a Stripe.Subscription into the User-update shape. `plan` comes
 * from `subscription.metadata.plan` (set by checkout) and is null when
 * absent — callers fall back to the existing `user.plan` so a status-only
 * update doesn't clobber it.
 *
 * `current_period_end` lives on `subscription.items.data[0]` in Stripe
 * API 2026-04-22 (was on the subscription itself before).
 */
export function subscriptionToUserUpdate(
	sub: Stripe.Subscription,
): SubscriptionUpdate {
	const customerId = extractCustomerId(sub.customer)
	if (!customerId) {
		throw new Error(
			`Subscription ${sub.id} has no resolvable customer id; refusing to update`,
		)
	}
	const periodEndUnix = sub.items.data[0]?.current_period_end
	return {
		stripe_customer_id: customerId,
		stripe_subscription_id: sub.id,
		subscription_status: sub.status,
		plan: sub.metadata?.plan ?? null,
		current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
	}
}

/**
 * How should the handler look up the User row this subscription belongs to?
 * Prefer `metadata.user_id` (set at checkout — most direct); fall back to
 * `stripe_customer_id` (older subs that pre-date metadata, or events from a
 * customer the user already has). Returns null only when neither is available.
 */
export type UserLookup =
	| { kind: "byId"; userId: string }
	| { kind: "byCustomer"; stripeCustomerId: string }

export function identifyUserCriteria(
	sub: Stripe.Subscription,
): UserLookup | null {
	const userId = sub.metadata?.user_id
	if (userId) return { kind: "byId", userId }
	const customerId = extractCustomerId(sub.customer)
	if (customerId) return { kind: "byCustomer", stripeCustomerId: customerId }
	return null
}

/**
 * Translate an invoice payment outcome to our `subscription_status`. Stripe
 * also fires subscription.updated for status transitions but invoice events
 * tend to arrive first, especially on payment_failed.
 */
export function invoiceOutcomeToStatus(
	outcome: "succeeded" | "failed",
): "active" | "past_due" {
	return outcome === "succeeded" ? "active" : "past_due"
}

import { Plan } from "@mcp-gcse/db"
import type Stripe from "stripe"

/**
 * Pure translation helpers for Stripe webhook payloads. No DB / SST access —
 * everything here is testable in isolation against fake Stripe-shaped objects.
 *
 * Lives in `packages/backend/src/billing/` because the Stripe webhook now
 * runs on the API Lambda (Hono route at `/stripe/webhook`). The web app no
 * longer hosts the receiver, so these translators have no other home.
 */

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

/**
 * Translate the `metadata.plan` checkout marker into the persisted Plan enum.
 *
 *  - `pro_monthly` and `pro_annual` are different billing cadences but the
 *    same entitlement, so both map to `Plan.pro_monthly`.
 *  - `limitless_monthly` maps directly.
 *  - Unknown / missing → null (caller decides whether to clobber existing
 *    user.plan or preserve it).
 */
export function toPersistedPlan(
	metadataPlan: string | null | undefined,
): Plan | null {
	switch (metadataPlan) {
		case "pro_monthly":
		case "pro_annual":
			return Plan.pro_monthly
		case "limitless_monthly":
			return Plan.limitless_monthly
		default:
			return null
	}
}

/** Shape of the User row we write when a subscription event arrives. */
export type SubscriptionUpdate = {
	stripe_customer_id: string
	stripe_subscription_id: string
	subscription_status: string
	plan: Plan | null
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
		plan: toPersistedPlan(sub.metadata?.plan),
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

/**
 * Discriminated decision for a `checkout.session.completed` event. Subscription
 * sessions are no-ops at this event (the subscription.* + invoice.* events
 * drive that path); payment-mode sessions need a ledger insert based on the
 * checkout's purchase kind.
 *
 * `userId` is read from `session.metadata.user_id` (set at checkout creation
 * by the server action). Missing user_id is a hard error — without it we
 * can't credit the right account.
 *
 * `kind` is `session.metadata.kind`, set explicitly to "ppu" or "topup" by
 * the corresponding server action. Anything else returns null so the handler
 * logs and ignores.
 */
export type CheckoutSessionDecision =
	| { kind: "ignore"; reason: string }
	| { kind: "ppu_purchase"; userId: string; sessionId: string }
	| { kind: "topup_purchase"; userId: string; sessionId: string }

export function decideCheckoutSessionAction(
	session: Stripe.Checkout.Session,
): CheckoutSessionDecision {
	if (session.mode !== "payment") {
		return { kind: "ignore", reason: `mode=${session.mode}` }
	}
	const purchaseKind = session.metadata?.kind
	const userId = session.metadata?.user_id
	const sessionId = session.id
	if (!userId) {
		return {
			kind: "ignore",
			reason: "payment-mode session missing metadata.user_id",
		}
	}
	if (purchaseKind === "ppu") {
		return { kind: "ppu_purchase", userId, sessionId }
	}
	if (purchaseKind === "topup") {
		return { kind: "topup_purchase", userId, sessionId }
	}
	return {
		kind: "ignore",
		reason: `payment-mode session with unknown metadata.kind=${purchaseKind ?? "<missing>"}`,
	}
}

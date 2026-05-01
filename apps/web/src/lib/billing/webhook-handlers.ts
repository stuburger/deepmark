import { db } from "@/lib/db"
import { log } from "@/lib/logger"
import type Stripe from "stripe"

import {
	extractCustomerId,
	identifyUserCriteria,
	invoiceOutcomeToStatus,
	subscriptionToUserUpdate,
} from "./webhook-translation"

const TAG = "billing/webhook"

/**
 * Apply a Stripe Subscription's current state to our User row. Single source
 * of truth: whatever Stripe says, we mirror. The `userId` comes from the
 * subscription's metadata (set when the Checkout Session was created); we
 * fall back to looking up by stripe_customer_id for older subs.
 */
export async function applySubscriptionToUser(
	subscription: Stripe.Subscription,
): Promise<void> {
	const lookup = identifyUserCriteria(subscription)
	if (!lookup) {
		log.warn(TAG, "Subscription event with no user lookup criteria", {
			subscriptionId: subscription.id,
		})
		return
	}

	const user =
		lookup.kind === "byId"
			? await db.user.findUnique({ where: { id: lookup.userId } })
			: await db.user.findUnique({
					where: { stripe_customer_id: lookup.stripeCustomerId },
				})

	if (!user) {
		log.warn(TAG, "Subscription event for unknown user", {
			lookup,
			subscriptionId: subscription.id,
		})
		return
	}

	const update = subscriptionToUserUpdate(subscription)
	await db.user.update({
		where: { id: user.id },
		data: {
			...update,
			// Status-only updates often arrive without a `plan` in metadata
			// (e.g. invoice.payment_failed → subscription.updated). Don't clobber
			// the existing plan when the event doesn't carry one.
			plan: update.plan ?? user.plan,
		},
	})

	log.info(TAG, "Applied subscription to user", {
		userId: user.id,
		status: update.subscription_status,
		plan: update.plan ?? user.plan,
	})
}

/**
 * On subscription deletion (full cancellation, end-of-period reached) clear
 * the active fields but keep `stripe_customer_id` so we can match a future
 * resubscription back to the same customer ledger.
 */
export async function clearSubscriptionFromUser(
	subscription: Stripe.Subscription,
): Promise<void> {
	const customerId = extractCustomerId(subscription.customer)
	if (!customerId) return

	const result = await db.user.updateMany({
		where: { stripe_customer_id: customerId },
		data: {
			stripe_subscription_id: null,
			subscription_status: subscription.status,
			plan: null,
			current_period_end: null,
		},
	})
	log.info(TAG, "Cleared subscription from user", {
		customerId,
		updatedRows: result.count,
	})
}

/**
 * Mirror an Invoice's payment outcome onto the User. Stripe also fires
 * subscription.updated for status changes, so this is mostly defensive — but
 * payment_failed in particular tends to arrive before the status update.
 */
export async function applyInvoiceToUser(
	invoice: Stripe.Invoice,
	outcome: "succeeded" | "failed",
): Promise<void> {
	const customerId = extractCustomerId(invoice.customer)
	if (!customerId) return

	await db.user.updateMany({
		where: { stripe_customer_id: customerId },
		data: { subscription_status: invoiceOutcomeToStatus(outcome) },
	})
	log.info(TAG, "Applied invoice outcome", {
		customerId,
		invoiceId: invoice.id,
		outcome,
	})
}

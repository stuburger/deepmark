import { Hono } from "hono"
import { Resource } from "sst"
import type Stripe from "stripe"

import { logger as log } from "@/lib/infra/logger"

import { stripeClient } from "./stripe-client"
import { isTransientError } from "./transient-error"
import {
	applyChargeRefunded,
	applyCompletedCheckoutSession,
	applyInvoiceFailed,
	applyInvoiceSucceeded,
	applySubscriptionToUser,
	clearSubscriptionFromUser,
} from "./webhook-handlers"

const TAG = "billing/webhook-route"

/**
 * Stripe webhook receiver, mounted as a Hono route on the API Gateway Lambda.
 *
 * Lives in the API Lambda (not Next.js) so SST's Live Lambda Development can
 * tunnel webhook deliveries from the deployed ApiGatewayV2 down to localhost
 * during `sst dev` — the previous Next.js route had no tunnel and only the
 * deployed (frozen) Lambda would ever see events while developing locally.
 *
 * Failure model (matches the previous Next.js route):
 *   - Signature mismatch / missing                     → 400 (drop)
 *   - Handler throws a TRANSIENT error (DB unreachable,
 *     pool timeout, deadlock, init failure, panic)     → 500 (Stripe retries
 *                                                       with backoff)
 *   - Handler throws anything else                     → 200 (swallow + log
 *                                                       loudly; retrying
 *                                                       won't help)
 *
 * The "swallow permanent errors" branch is deliberate: a malformed payload
 * or a missing user row will fail every retry, so we'd just keep accepting
 * the same broken event for hours/days. Logging once is the right move.
 */
export const stripeWebhookRoute = new Hono().post("/webhook", async (c) => {
	const signature = c.req.header("stripe-signature")
	if (!signature) {
		return c.json({ error: "Missing signature" }, 400)
	}

	const rawBody = await c.req.text()
	let event: Stripe.Event
	try {
		event = stripeClient().webhooks.constructEvent(
			rawBody,
			signature,
			Resource.StripeWebhookSecret.secret,
		)
	} catch (err) {
		log.warn(TAG, "Signature verification failed", {
			error: err instanceof Error ? err.message : String(err),
		})
		return c.json({ error: "Invalid signature" }, 400)
	}

	try {
		switch (event.type) {
			case "customer.subscription.created":
			case "customer.subscription.updated":
				await applySubscriptionToUser(event.data.object)
				break
			case "customer.subscription.deleted":
				await clearSubscriptionFromUser(event.data.object)
				break
			case "invoice.payment_succeeded":
				await applyInvoiceSucceeded(event.data.object)
				break
			case "invoice.payment_failed":
				await applyInvoiceFailed(event.data.object)
				break
			case "charge.refunded":
				await applyChargeRefunded(event.data.object)
				break
			case "checkout.session.completed":
				// Subscription sessions are no-ops here (the subscription.* +
				// invoice.* events drive that flow). Payment-mode sessions (PPU,
				// top-up) need a ledger insert — handler decides which.
				await applyCompletedCheckoutSession(event.data.object)
				break
			default:
				log.info(TAG, "Ignored event", { type: event.type })
		}
	} catch (err) {
		const transient = isTransientError(err)
		log.error(TAG, "Webhook handler failed", {
			eventType: event.type,
			eventId: event.id,
			transient,
			error: err instanceof Error ? err.message : String(err),
			stack: err instanceof Error ? err.stack : undefined,
		})
		if (transient) {
			// Tell Stripe to retry — DB is temporarily unhealthy and the next
			// attempt will likely succeed.
			return c.json({ error: "Transient failure, retrying" }, 500)
		}
		// Permanent: ack with 200 so Stripe stops retrying.
	}

	return c.json({ received: true })
})

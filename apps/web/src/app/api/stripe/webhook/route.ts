import { stripeClient } from "@/lib/billing/stripe-client"
import { isTransientError } from "@/lib/billing/transient-error"
import {
	applyInvoiceToUser,
	applySubscriptionToUser,
	clearSubscriptionFromUser,
} from "@/lib/billing/webhook-handlers"
import { log } from "@/lib/logger"
import { NextResponse } from "next/server"
import { Resource } from "sst"
import type Stripe from "stripe"

const TAG = "api/stripe/webhook"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Stripe webhook receiver. Verifies the signature, dispatches by event type.
 *
 * Failure model:
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
export async function POST(req: Request): Promise<NextResponse> {
	const signature = req.headers.get("stripe-signature")
	if (!signature) {
		return NextResponse.json({ error: "Missing signature" }, { status: 400 })
	}

	const rawBody = await req.text()
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
		return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
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
				await applyInvoiceToUser(event.data.object, "succeeded")
				break
			case "invoice.payment_failed":
				await applyInvoiceToUser(event.data.object, "failed")
				break
			case "checkout.session.completed":
				// Subscription created event will follow with full state — nothing to
				// do here beyond logging that the user came back from Checkout.
				log.info(TAG, "Checkout completed", {
					sessionId: event.data.object.id,
					customerId: event.data.object.customer,
				})
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
			return NextResponse.json(
				{ error: "Transient failure, retrying" },
				{ status: 500 },
			)
		}
		// Permanent: ack with 200 so Stripe stops retrying.
	}

	return NextResponse.json({ received: true })
}

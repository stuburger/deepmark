import {
	Plan,
	expirePreviousPeriodGrant,
	insertPpuPurchase,
	insertSubscriptionGrant,
	insertTopUpPurchase,
} from "@mcp-gcse/db"
import { EventDetailType, EventSource } from "@mcp-gcse/emails"
import { Resource } from "sst"
import type Stripe from "stripe"

import { db } from "@/db/client"
import { emitEvent } from "@/lib/events/emit"
import { logger as log } from "@/lib/infra/logger"

import { stripeToActiveDiscount } from "./active-discount"
import { detectWelcomeUpgrade } from "./upgrade-detection"
import {
	decideCheckoutSessionAction,
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
	const finalPlan = update.plan ?? user.plan
	await db.user.update({
		where: { id: user.id },
		data: {
			...update,
			// Status-only updates often arrive without a `plan` in metadata
			// (e.g. invoice.payment_failed → subscription.updated). Don't clobber
			// the existing plan when the event doesn't carry one.
			plan: finalPlan,
		},
	})

	log.info(TAG, "Applied subscription to user", {
		userId: user.id,
		status: update.subscription_status,
		plan: finalPlan,
	})

	// Emit a "first time on this paying tier" event so the EmailSubscriber
	// can fire welcome-to-Pro / welcome-to-Unlimited. Renewals (Pro → Pro)
	// produce no event. Pure helper — no DB read, takes the previous + new
	// plan in.
	const upgrade = detectWelcomeUpgrade(user.plan, finalPlan)
	if (upgrade) {
		const standardAmount = readStandardAmount(subscription)
		const currency =
			subscription.currency ??
			subscription.items.data[0]?.price?.currency ??
			null
		if (standardAmount !== null && currency) {
			await emitEvent({
				source: EventSource.billing,
				detailType: EventDetailType.subscriptionUpgraded,
				detail: {
					userId: user.id,
					plan: upgrade,
					standardAmount,
					currency: currency.toLowerCase(),
					discount: stripeToActiveDiscount(subscription),
				},
			})
		} else {
			log.warn(
				TAG,
				"Upgrade detected but price not resolvable; skipping email",
				{
					userId: user.id,
					plan: finalPlan,
				},
			)
		}
	}
}

function readStandardAmount(sub: Stripe.Subscription): number | null {
	const price = sub.items.data[0]?.price
	if (!price?.unit_amount) return null
	const interval = price.recurring?.interval
	const intervalCount = price.recurring?.interval_count ?? 1
	if (interval === "year")
		return Math.round(price.unit_amount / (12 * intervalCount))
	if (interval === "month") return Math.round(price.unit_amount / intervalCount)
	return price.unit_amount
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
 * Handle invoice.payment_failed — mirror the past_due status onto User and
 * fire a dunning email so the teacher knows before they hit a paywall.
 *
 * Stripe attempts 4 times by default and re-fires this webhook on each
 * attempt, so the recipient will get up to 4 emails over ~3 weeks. That's
 * the desired behaviour — by attempt 4, Stripe is about to cancel and they
 * need to act. (If Stripe's own dunning emails are enabled in the
 * dashboard, disable them to avoid double-sending.)
 *
 * Stripe also fires subscription.updated for status changes, so the status
 * mirror here is mostly defensive (payment_failed tends to arrive before
 * the status update).
 */
export async function applyInvoiceFailed(
	invoice: Stripe.Invoice,
): Promise<void> {
	const customerId = extractCustomerId(invoice.customer)
	if (!customerId) return

	const user = await db.user.findUnique({
		where: { stripe_customer_id: customerId },
		select: { id: true, plan: true },
	})

	await db.user.updateMany({
		where: { stripe_customer_id: customerId },
		data: { subscription_status: invoiceOutcomeToStatus("failed") },
	})
	log.info(TAG, "Applied failed invoice", {
		customerId,
		invoiceId: invoice.id,
	})

	if (!user) {
		log.warn(TAG, "invoice.payment_failed for unknown customer", {
			customerId,
			invoiceId: invoice.id,
		})
		return
	}

	if (user.plan !== Plan.pro_monthly && user.plan !== Plan.unlimited_monthly) {
		// No paying plan attached to the user record — nothing to dun about.
		// Status mirror still happened above; the email isn't meaningful here.
		log.info(TAG, "invoice.payment_failed without resolvable plan; no email", {
			userId: user.id,
			plan: user.plan,
		})
		return
	}

	if (!invoice.id) {
		log.warn(TAG, "invoice.payment_failed has no invoice id; skipping email", {
			userId: user.id,
		})
		return
	}

	await emitEvent({
		source: EventSource.billing,
		detailType: EventDetailType.paymentFailed,
		detail: {
			userId: user.id,
			stripeInvoiceId: invoice.id,
			plan: user.plan,
			amountDue: invoice.amount_due,
			currency: (invoice.currency ?? "gbp").toLowerCase(),
			attemptCount: invoice.attempt_count ?? 1,
			nextAttemptAt: invoice.next_payment_attempt
				? new Date(invoice.next_payment_attempt * 1000).toISOString()
				: null,
		},
	})
}

/**
 * Handle invoice.payment_succeeded — the rich case.
 *
 * Two effects:
 *  1. Mirror status=active onto User (defensive — subscription.updated
 *     usually carries this too, but we don't want to depend on event order).
 *  2. For capped Pro subscribers (Plan.pro_monthly), atomically:
 *     a. Insert a `subscription_grant` of `proMonthlyGrantSize` (60) papers,
 *        keyed on this invoice id (idempotent on replay).
 *     b. Insert a `period_expiry` zeroing any unused subscription credits
 *        from the previous period (also idempotent on this invoice id).
 *
 * Unlimited users are uncapped — no ledger work for them. Trial / PPU-only
 * users have no subscription invoices at all, so this handler is a no-op for
 * them by construction.
 */
export async function applyInvoiceSucceeded(
	invoice: Stripe.Invoice,
): Promise<void> {
	const customerId = extractCustomerId(invoice.customer)
	if (!customerId) return

	const user = await db.user.findUnique({
		where: { stripe_customer_id: customerId },
		select: { id: true, plan: true },
	})
	if (!user) {
		log.warn(TAG, "invoice.payment_succeeded for unknown customer", {
			customerId,
			invoiceId: invoice.id,
		})
		return
	}

	// Status mirror — same as applyInvoiceFailed for symmetry, but with
	// status=active.
	await db.user.update({
		where: { id: user.id },
		data: { subscription_status: invoiceOutcomeToStatus("succeeded") },
	})

	// Ledger work only for capped Pro. Unlimited is uncapped (no
	// subscription_grant rows means no expirePreviousPeriodGrant either).
	if (user.plan !== Plan.pro_monthly) {
		log.info(
			TAG,
			"invoice.payment_succeeded — non-capped plan, no ledger work",
			{
				userId: user.id,
				invoiceId: invoice.id,
				plan: user.plan,
			},
		)
		return
	}

	const periodBounds = readPeriodBounds(invoice)
	if (!periodBounds) {
		log.warn(TAG, "invoice has no resolvable period bounds; skipping grant", {
			userId: user.id,
			invoiceId: invoice.id,
		})
		return
	}

	const invoiceId = invoice.id
	if (!invoiceId) {
		log.warn(TAG, "invoice has no id; skipping grant", {
			userId: user.id,
			customerId,
		})
		return
	}

	// Expire previous period first so the new grant lands on a clean balance.
	// Both operations are individually idempotent on stripe_invoice_id, so a
	// retry of either step is safe.
	const [expiry, grant] = await Promise.all([
		expirePreviousPeriodGrant({
			db,
			userId: user.id,
			newInvoiceId: invoiceId,
		}),
		insertSubscriptionGrant({
			db,
			userId: user.id,
			papers: Resource.StripeConfig.proMonthlyGrantSize,
			stripeInvoiceId: invoiceId,
			periodId: invoiceId,
			periodStartsAt: periodBounds.startsAt,
			periodEndsAt: periodBounds.endsAt,
		}),
	])

	log.info(TAG, "Applied subscription period rollover", {
		userId: user.id,
		invoiceId: invoiceId,
		grantedPapers: grant.granted
			? Resource.StripeConfig.proMonthlyGrantSize
			: 0,
		expiredPapers: expiry.expired,
	})
}

/**
 * Stub for Stripe-side refunds of one-off payments (PPU sets, top-ups).
 *
 * Auto-reversal is intentionally deferred — the schema's
 * `stripe_session_id @unique` blocks reusing the original session_id on a
 * reversal row, and same-`kind` + negative-`papers` would also conflict.
 * A clean fix needs either a new `purchase_refund` LedgerEntryKind or a
 * `@@unique([kind, stripe_session_id])` rework with a sign convention.
 *
 * For Phase 5 launch: refunds are rare and handled manually via the admin
 * Credits page (negative grant + audit note). Revisit when refund volume
 * justifies the schema change.
 *
 * Subscription refunds aren't relevant here — Stripe handles them via
 * subscription.updated and proration on the next invoice; no ledger
 * intervention needed.
 */
export async function applyChargeRefunded(
	charge: Stripe.Charge,
): Promise<void> {
	log.info(
		TAG,
		"charge.refunded received — auto-reversal not yet wired; handle via admin Credits if needed",
		{
			chargeId: charge.id,
			customerId: extractCustomerId(charge.customer),
			amountRefunded: charge.amount_refunded,
		},
	)
}

/**
 * Handle `checkout.session.completed`. Branches on session mode + metadata:
 *  - `mode=subscription` → no-op (subscription.* + invoice.* drive that flow)
 *  - `mode=payment` + `metadata.kind=ppu` → grant `ppu.papersPerSet` papers
 *  - `mode=payment` + `metadata.kind=topup` → grant `topUp.papersPerPurchase`
 *
 * Idempotent via the `stripe_session_id @unique` constraint on the ledger —
 * webhook replays return `{granted: false}` without inserting a duplicate.
 */
export async function applyCompletedCheckoutSession(
	session: Stripe.Checkout.Session,
): Promise<void> {
	const decision = decideCheckoutSessionAction(session)

	if (decision.kind === "ignore") {
		log.info(TAG, "checkout.session.completed ignored", {
			sessionId: session.id,
			reason: decision.reason,
		})
		return
	}

	const papers =
		decision.kind === "ppu_purchase"
			? Resource.StripeConfig.ppu.papersPerSet
			: Resource.StripeConfig.topUp.papersPerPurchase

	const result =
		decision.kind === "ppu_purchase"
			? await insertPpuPurchase({
					db,
					userId: decision.userId,
					papers,
					stripeSessionId: decision.sessionId,
				})
			: await insertTopUpPurchase({
					db,
					userId: decision.userId,
					papers,
					stripeSessionId: decision.sessionId,
				})

	log.info(TAG, "Applied checkout completion", {
		userId: decision.userId,
		sessionId: decision.sessionId,
		kind: decision.kind,
		papers,
		granted: result.granted,
	})

	// Only emit on the first ledger insert — replays return granted=false and
	// must NOT re-trigger the thank-you email.
	if (!result.granted) return

	const currency = (session.currency ?? "gbp").toLowerCase()
	const amount = session.amount_total ?? 0
	if (decision.kind === "ppu_purchase") {
		await emitEvent({
			source: EventSource.billing,
			detailType: EventDetailType.ppuPurchased,
			detail: {
				userId: decision.userId,
				currency,
				amount,
				papersGranted: papers,
			},
		})
	} else {
		await emitEvent({
			source: EventSource.billing,
			detailType: EventDetailType.topupPurchased,
			detail: {
				userId: decision.userId,
				currency,
				amount,
				papersGranted: papers,
			},
		})
	}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readPeriodBounds(
	invoice: Stripe.Invoice,
): { startsAt: Date; endsAt: Date } | null {
	const line = invoice.lines.data[0]
	if (!line?.period) return null
	return {
		startsAt: new Date(line.period.start * 1000),
		endsAt: new Date(line.period.end * 1000),
	}
}

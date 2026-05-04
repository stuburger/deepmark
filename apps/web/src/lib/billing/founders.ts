import { db } from "@/lib/db"
import { Resource } from "sst"

import { stripeClient } from "./stripe-client"

/**
 * Are founders' slots still available? Counts users who currently hold an
 * active Pro subscription. The Stripe coupon also has max_redemptions set
 * (same number, single source of truth in `infra/billing.ts`); this
 * server-side check is what the UI / checkout flow reads so the badge state
 * and the actual coupon-attach decision agree.
 */
export async function foundersSlotsRemaining(): Promise<number> {
	const taken = await db.user.count({
		where: { stripe_subscription_id: { not: null } },
	})
	return Math.max(0, Resource.StripeConfig.foundersSlotLimit - taken)
}

export async function foundersAvailable(): Promise<boolean> {
	return (await foundersSlotsRemaining()) > 0
}

/**
 * Is this user currently inside the founders' lock-in period? Derived from
 * the Stripe subscription's `discounts` array rather than mirrored on User —
 * Stripe is the canonical source for coupon attachment, so we ask Stripe
 * directly rather than risk a stale local snapshot.
 *
 * Returns false for users without a subscription or with no founders coupon
 * attached. Returns false on Stripe API errors — better to lose the founders
 * badge than to fail an unrelated request.
 *
 * One Stripe API call per invocation. The Discount object's `source.coupon`
 * may be either a string id or an expanded Coupon — we accept both and
 * normalise to an id for comparison, so no `expand` parameter is required.
 * UI surfaces that need this on every render should fold it into a
 * request-cached read alongside `getEntitlement`.
 */
export async function isFounder(userId: string): Promise<boolean> {
	const user = await db.user.findUnique({
		where: { id: userId },
		select: { stripe_subscription_id: true },
	})
	if (!user?.stripe_subscription_id) return false
	try {
		const sub = await stripeClient().subscriptions.retrieve(
			user.stripe_subscription_id,
		)
		const foundersCouponId = Resource.StripeConfig.foundersCouponId
		return sub.discounts.some((d) => {
			if (typeof d === "string") return false
			const coupon = d.source.coupon
			if (coupon === null) return false
			const couponId = typeof coupon === "string" ? coupon : coupon.id
			return couponId === foundersCouponId
		})
	} catch {
		return false
	}
}

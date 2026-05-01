import { db } from "@/lib/db"
import { Resource } from "sst"

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

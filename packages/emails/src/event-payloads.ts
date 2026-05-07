import type { ActiveDiscount } from "./discount"

/**
 * Shared event-payload schemas. These are the contract between every emit
 * site (auth handler, billing webhook, grade processor) and the
 * EmailSubscriber Lambda. Keeping them here means the producer and
 * consumer can never drift on shape.
 *
 * Detail-types are flat strings (no enum) so the bus pattern matcher is
 * obvious; sources are namespaced `deepmark.<domain>`.
 */

export type UserSignedUpDetail = {
	userId: string
	email: string
	signupMethod: "github" | "google"
}

export type SubscriptionUpgradedDetail = {
	userId: string
	plan: "pro_monthly" | "unlimited_monthly"
	standardAmount: number
	currency: string
	discount: ActiveDiscount | null
}

export type PpuPurchasedDetail = {
	userId: string
	currency: string
	amount: number
	papersGranted: number
}

export type TopupPurchasedDetail = {
	userId: string
	currency: string
	amount: number
	papersGranted: number
}

export type ProcessingBatchKind = "initial" | "re_extract" | "re_grade"

export type BatchCompletedDetail = {
	processingBatchId: string
	kind: ProcessingBatchKind
	triggeredBy: string
	totalSubmissions: number
	successCount: number
	failedCount: number
}

/**
 * Source/detail-type strings used on EventBridge. Importing the constants
 * (rather than free-typing) gives compile-time matching between emit sites
 * and the subscriber's switch.
 */
export const EventSource = {
	users: "deepmark.users",
	billing: "deepmark.billing",
	marking: "deepmark.marking",
} as const

export const EventDetailType = {
	userSignedUp: "user.signed_up",
	subscriptionUpgraded: "subscription.upgraded",
	ppuPurchased: "ppu.purchased",
	topupPurchased: "topup.purchased",
	batchCompleted: "batch.completed",
} as const

export type EventDetailTypeValue =
	(typeof EventDetailType)[keyof typeof EventDetailType]

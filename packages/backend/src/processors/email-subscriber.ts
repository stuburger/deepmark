import { Plan, createPrismaClient } from "@mcp-gcse/db"
import {
	type BatchCompletedDetail,
	EventDetailType,
	type EventDetailTypeValue,
	type PpuPurchasedDetail,
	type RenderedEmail,
	type SubscriptionUpgradedDetail,
	type TopupPurchasedDetail,
	type UserSignedUpDetail,
	renderMarkingCompleteEmail,
	renderPpuThankYouEmail,
	renderTopupThankYouEmail,
	renderWelcomeEmail,
	renderWelcomeToProEmail,
	renderWelcomeToUnlimitedEmail,
} from "@mcp-gcse/emails"
import type { EventBridgeEvent } from "aws-lambda"
import { Resource } from "sst"

import { sendEmail } from "@/lib/email/send"
import { logger } from "@/lib/infra/logger"

const TAG = "email-subscriber"

const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

const WEB_URL = process.env.WEB_URL ?? "https://getdeepmark.com"
const LOGO_URL = `${WEB_URL}/octopus-logo.png`

/**
 * EventBridge → render → SES.
 *
 * One handler, one concern: turn a domain event into an outbound email.
 * Analytics, push, audit logging — all out of scope here.
 *
 * The DLQ + retry policy is configured on the bus subscription
 * (`infra/events.ts`) — a thrown error here gets retried twice, then
 * routed to `EmailSubscriberDLQ`.
 */
export async function handler(
	event: EventBridgeEvent<EventDetailTypeValue, unknown>,
): Promise<void> {
	logger.info(TAG, "Received event", {
		source: event.source,
		detailType: event["detail-type"],
		eventId: event.id,
	})

	const rendered = await dispatch(event)
	if (!rendered) {
		logger.warn(TAG, "Dispatch returned no email; nothing to send", {
			detailType: event["detail-type"],
		})
		return
	}

	await sendEmail({ to: rendered.to, rendered: rendered.email })
}

type Dispatched = { to: string; email: RenderedEmail } | null

async function dispatch(
	event: EventBridgeEvent<EventDetailTypeValue, unknown>,
): Promise<Dispatched> {
	switch (event["detail-type"]) {
		case EventDetailType.userSignedUp:
			return dispatchUserSignedUp(event.detail as UserSignedUpDetail)
		case EventDetailType.subscriptionUpgraded:
			return dispatchSubscriptionUpgraded(
				event.detail as SubscriptionUpgradedDetail,
			)
		case EventDetailType.ppuPurchased:
			return dispatchPpuPurchased(event.detail as PpuPurchasedDetail)
		case EventDetailType.topupPurchased:
			return dispatchTopupPurchased(event.detail as TopupPurchasedDetail)
		case EventDetailType.batchCompleted:
			return dispatchBatchCompleted(event.detail as BatchCompletedDetail)
		default:
			logger.warn(TAG, "Unrecognised detail-type; ignoring", {
				detailType: event["detail-type"],
			})
			return null
	}
}

async function dispatchUserSignedUp(
	detail: UserSignedUpDetail,
): Promise<Dispatched> {
	const user = await db.user.findUnique({
		where: { id: detail.userId },
		select: { email: true, name: true },
	})
	if (!user?.email) return null
	const email = await renderWelcomeEmail({
		firstName: firstNameFrom(user.name),
		trialPaperCap: Resource.StripeConfig.trialPaperCap,
		dashboardUrl: `${WEB_URL}/teacher`,
		logoUrl: LOGO_URL,
	})
	return { to: user.email, email }
}

async function dispatchSubscriptionUpgraded(
	detail: SubscriptionUpgradedDetail,
): Promise<Dispatched> {
	const user = await db.user.findUnique({
		where: { id: detail.userId },
		select: { email: true, name: true },
	})
	if (!user?.email) return null
	const firstName = firstNameFrom(user.name)
	const standardPriceLabel = formatMoney(detail.standardAmount, detail.currency)

	if (detail.plan === Plan.unlimited_monthly) {
		const email = await renderWelcomeToUnlimitedEmail({
			firstName,
			standardPriceLabel,
			dashboardUrl: `${WEB_URL}/teacher`,
			billingUrl: `${WEB_URL}/teacher/settings/billing`,
			logoUrl: LOGO_URL,
		})
		return { to: user.email, email }
	}

	const email = await renderWelcomeToProEmail({
		firstName,
		standardPriceLabel,
		discount: rehydrateDiscountDates(detail.discount),
		monthlyGrantSize: Resource.StripeConfig.proMonthlyGrantSize,
		dashboardUrl: `${WEB_URL}/teacher`,
		billingUrl: `${WEB_URL}/teacher/settings/billing`,
		logoUrl: LOGO_URL,
	})
	return { to: user.email, email }
}

async function dispatchPpuPurchased(
	detail: PpuPurchasedDetail,
): Promise<Dispatched> {
	const user = await db.user.findUnique({
		where: { id: detail.userId },
		select: { email: true, name: true },
	})
	if (!user?.email) return null
	const email = await renderPpuThankYouEmail({
		firstName: firstNameFrom(user.name),
		papersAdded: detail.papersGranted,
		priceLabel: formatMoney(detail.amount, detail.currency),
		dashboardUrl: `${WEB_URL}/teacher`,
		logoUrl: LOGO_URL,
	})
	return { to: user.email, email }
}

async function dispatchTopupPurchased(
	detail: TopupPurchasedDetail,
): Promise<Dispatched> {
	const user = await db.user.findUnique({
		where: { id: detail.userId },
		select: { email: true, name: true },
	})
	if (!user?.email) return null
	const email = await renderTopupThankYouEmail({
		firstName: firstNameFrom(user.name),
		papersAdded: detail.papersGranted,
		priceLabel: formatMoney(detail.amount, detail.currency),
		dashboardUrl: `${WEB_URL}/teacher`,
		logoUrl: LOGO_URL,
	})
	return { to: user.email, email }
}

async function dispatchBatchCompleted(
	detail: BatchCompletedDetail,
): Promise<Dispatched> {
	const batch = await db.processingBatch.findUnique({
		where: { id: detail.processingBatchId },
		select: {
			exam_paper_id: true,
			exam_paper: { select: { title: true } },
			triggerer: { select: { email: true, name: true } },
		},
	})
	if (!batch?.triggerer?.email) return null
	const email = await renderMarkingCompleteEmail({
		firstName: firstNameFrom(batch.triggerer.name),
		examPaperTitle: batch.exam_paper?.title ?? "your batch",
		kind: detail.kind,
		successCount: detail.successCount,
		failedCount: detail.failedCount,
		submissionsUrl: `${WEB_URL}/teacher/exam-papers/${batch.exam_paper_id}?tab=submissions`,
		logoUrl: LOGO_URL,
	})
	return { to: batch.triggerer.email, email }
}

function firstNameFrom(name: string | null): string | null {
	if (!name) return null
	const trimmed = name.trim()
	if (!trimmed) return null
	const first = trimmed.split(/\s+/)[0]
	return first ?? null
}

function formatMoney(minorUnits: number, currency: string): string {
	const major = minorUnits / 100
	const formatted = major.toLocaleString("en-GB", {
		minimumFractionDigits: major === Math.round(major) ? 0 : 2,
		maximumFractionDigits: 2,
	})
	const symbol = currencySymbol(currency)
	return `${symbol}${formatted}`
}

function currencySymbol(currency: string): string {
	switch (currency.toLowerCase()) {
		case "gbp":
			return "£"
		case "usd":
			return "$"
		case "eur":
			return "€"
		default:
			return `${currency.toUpperCase()} `
	}
}

/**
 * EventBridge serialises the payload through JSON, so `Date` instances on
 * the way in arrive as ISO strings on the way out. Re-hydrate before
 * passing into the template, which expects a real `Date`.
 */
function rehydrateDiscountDates(
	discount: SubscriptionUpgradedDetail["discount"],
): SubscriptionUpgradedDetail["discount"] {
	if (!discount) return null
	const endsAt = discount.endsAt
	if (!endsAt) return discount
	if (endsAt instanceof Date) return discount
	return { ...discount, endsAt: new Date(endsAt as unknown as string) }
}

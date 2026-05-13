import { Plan, createPrismaClient } from "@mcp-gcse/db"
import {
	type BatchCompletedDetail,
	EventDetailType,
	type EventDetailTypeValue,
	type PaymentFailedDetail,
	type PpuPurchasedDetail,
	type RenderedEmail,
	type ResourceSharedDetail,
	type SubscriptionUpgradedDetail,
	type TopupPurchasedDetail,
	type UserSignedUpDetail,
	renderMarkingCompleteEmail,
	renderPaymentFailedEmail,
	renderPpuThankYouEmail,
	renderResourceSharedEmail,
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
		case EventDetailType.resourceShared:
			return dispatchResourceShared(event.detail as ResourceSharedDetail)
		case EventDetailType.paymentFailed:
			return dispatchPaymentFailed(event.detail as PaymentFailedDetail)
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

async function dispatchResourceShared(
	detail: ResourceSharedDetail,
): Promise<Dispatched> {
	const grant = await db.resourceGrant.findUnique({
		where: { id: detail.grantId, revoked_at: null },
		select: {
			resource_type: true,
			resource_id: true,
			principal_email: true,
			principal_user_id: true,
			role: true,
		},
	})
	if (!grant) return null

	const recipientEmail = grant.principal_email
	if (!recipientEmail) return null

	const [sharer, recipient, resourceInfo] = await Promise.all([
		db.user.findUnique({
			where: { id: detail.sharedByUserId },
			select: { name: true, email: true },
		}),
		grant.principal_user_id
			? db.user.findUnique({
					where: { id: grant.principal_user_id },
					select: { name: true },
				})
			: null,
		resolveResourceInfo(grant.resource_type, grant.resource_id),
	])

	if (!sharer?.email) return null
	// Don't notify if sharing with yourself
	if (sharer.email === recipientEmail) return null

	const email = await renderResourceSharedEmail({
		recipientFirstName: recipient ? firstNameFrom(recipient.name) : null,
		sharedByName: sharer.name,
		sharedByEmail: sharer.email,
		resourceType: grant.resource_type,
		resourceTitle: resourceInfo.title,
		role: grant.role,
		resourceUrl: resourceInfo.url,
		logoUrl: LOGO_URL,
	})
	return { to: recipientEmail, email }
}

async function dispatchPaymentFailed(
	detail: PaymentFailedDetail,
): Promise<Dispatched> {
	const user = await db.user.findUnique({
		where: { id: detail.userId },
		select: { email: true, name: true },
	})
	if (!user?.email) return null

	const email = await renderPaymentFailedEmail({
		firstName: firstNameFrom(user.name),
		planLabel: planDisplayLabel(detail.plan),
		amountLabel: formatMoney(detail.amountDue, detail.currency),
		attemptCount: detail.attemptCount,
		nextAttemptAt: detail.nextAttemptAt ? new Date(detail.nextAttemptAt) : null,
		billingUrl: `${WEB_URL}/teacher/settings/billing`,
		logoUrl: LOGO_URL,
	})
	return { to: user.email, email }
}

function planDisplayLabel(plan: PaymentFailedDetail["plan"]): string {
	switch (plan) {
		case "pro_monthly":
			return "DeepMark Pro"
		case "unlimited_monthly":
			return "DeepMark Unlimited"
	}
}

type ResourceInfo = { title: string; url: string }

async function resolveResourceInfo(
	resourceType: string,
	resourceId: string,
): Promise<ResourceInfo> {
	if (resourceType === "exam_paper") {
		const paper = await db.examPaper.findUnique({
			where: { id: resourceId },
			select: { title: true },
		})
		return {
			title: paper?.title ?? "an exam paper",
			url: `${WEB_URL}/teacher/exam-papers/${resourceId}`,
		}
	}
	if (resourceType === "student_submission") {
		const submission = await db.studentSubmission.findUnique({
			where: { id: resourceId },
			select: {
				student_name: true,
				exam_paper_id: true,
				exam_paper: { select: { title: true } },
			},
		})
		if (!submission) {
			return {
				title: "a student submission",
				url: `${WEB_URL}/teacher/exam-papers`,
			}
		}
		const studentLabel = submission.student_name ?? "Unknown student"
		const paperLabel = submission.exam_paper?.title ?? "Unknown paper"
		return {
			title: `${studentLabel} — ${paperLabel}`,
			url: `${WEB_URL}/teacher/exam-papers/${submission.exam_paper_id}?tab=submissions`,
		}
	}
	return { title: "a resource", url: `${WEB_URL}/teacher` }
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

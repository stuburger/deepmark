import { createPrismaClient } from "@mcp-gcse/db"
import { type BatchCompletedDetail, EventDetailType } from "@mcp-gcse/emails"
import type { EventBridgeEvent } from "aws-lambda"
import { Resource } from "sst"
import webPush from "web-push"

import { logger } from "@/lib/infra/logger"

const TAG = "push-subscriber"

const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

let vapidConfigured = false
function configureVapid(): void {
	if (vapidConfigured) return
	webPush.setVapidDetails(
		"mailto:hello@getdeepmark.com",
		Resource.VapidPublicKey.value,
		Resource.VapidPrivateKey.value,
	)
	vapidConfigured = true
}

/**
 * EventBridge → web-push.
 *
 * Replaces the inline `sendBatchCompleteNotification` call previously made
 * directly from the grading processor. Same contract — one push per batch,
 * addressed to the teacher (`uploaded_by`) — just driven by the bus instead
 * of an in-process import.
 *
 * Filtered to `deepmark.marking` + `batch.completed` at the subscription
 * level, so any other detail-type reaching this handler is a config bug.
 */
export async function handler(
	event: EventBridgeEvent<typeof EventDetailType.batchCompleted, unknown>,
): Promise<void> {
	if (event["detail-type"] !== EventDetailType.batchCompleted) {
		logger.warn(TAG, "Unexpected detail-type for push subscriber; ignoring", {
			detailType: event["detail-type"],
		})
		return
	}

	const detail = event.detail as BatchCompletedDetail

	const subscriptions = await db.userPushSubscription.findMany({
		where: { user_id: detail.uploadedBy },
	})
	if (subscriptions.length === 0) {
		logger.info(TAG, "No push subscriptions registered; skipping", {
			batchJobId: detail.batchJobId,
			uploadedBy: detail.uploadedBy,
		})
		return
	}

	const batch = await db.batchIngestJob.findUnique({
		where: { id: detail.batchJobId },
		select: { exam_paper: { select: { title: true } } },
	})
	const examPaperTitle = batch?.exam_paper?.title ?? "your batch"

	configureVapid()

	const payload = JSON.stringify({
		title: "Batch marking complete",
		body: `${detail.totalSubmissions} script${detail.totalSubmissions === 1 ? "" : "s"} marked for ${examPaperTitle}`,
		batchJobId: detail.batchJobId,
	})

	const results = await Promise.allSettled(
		subscriptions.map((sub) =>
			webPush.sendNotification(
				{
					endpoint: sub.endpoint,
					keys: { p256dh: sub.p256dh, auth: sub.auth },
				},
				payload,
			),
		),
	)

	const failed = results.filter((r) => r.status === "rejected").length
	if (failed > 0) {
		logger.warn(TAG, "Some push deliveries failed", {
			batchJobId: detail.batchJobId,
			total: subscriptions.length,
			failed,
		})
	} else {
		logger.info(TAG, "Push delivered to all subscriptions", {
			batchJobId: detail.batchJobId,
			total: subscriptions.length,
		})
	}
}

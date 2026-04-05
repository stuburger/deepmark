import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import webPush from "web-push"

const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

export async function sendBatchCompleteNotification(
	batchJobId: string,
	uploadedBy: string,
	examPaperTitle: string,
	studentCount: number,
): Promise<void> {
	const subscriptions = await db.userPushSubscription.findMany({
		where: { user_id: uploadedBy },
	})

	if (subscriptions.length === 0) return

	webPush.setVapidDetails(
		"mailto:noreply@deepmark.app",
		Resource.VapidPublicKey.value,
		Resource.VapidPrivateKey.value,
	)

	const payload = JSON.stringify({
		title: "Batch marking complete",
		body: `${studentCount} script${studentCount === 1 ? "" : "s"} marked for ${examPaperTitle}`,
		batchJobId,
	})

	await Promise.allSettled(
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
}

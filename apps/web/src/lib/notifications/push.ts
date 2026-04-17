"use server"

import { db } from "@/lib/db"
import { Resource } from "sst"
import { auth } from "../auth"

// ─── getVapidPublicKey ────────────────────────────────────────────────────────

export async function getVapidPublicKey(): Promise<string> {
	return Resource.VapidPublicKey.value
}

// ─── registerPushSubscription ─────────────────────────────────────────────────

export type RegisterPushSubscriptionResult =
	| { ok: true }
	| { ok: false; error: string }

export async function registerPushSubscription({
	endpoint,
	p256dh,
	auth: authKey,
	userAgent,
}: {
	endpoint: string
	p256dh: string
	auth: string
	userAgent?: string
}): Promise<RegisterPushSubscriptionResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	await db.userPushSubscription.upsert({
		where: { endpoint },
		create: {
			user_id: session.userId,
			endpoint,
			p256dh,
			auth: authKey,
			user_agent: userAgent,
		},
		update: {
			p256dh,
			auth: authKey,
			user_agent: userAgent,
		},
	})

	return { ok: true }
}

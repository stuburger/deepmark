"use server"

import { authenticatedAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { Resource } from "sst"
import { z } from "zod"

// ─── getVapidPublicKey ────────────────────────────────────────────────────────

export const getVapidPublicKey = authenticatedAction.action(
	async (): Promise<{ key: string }> => {
		return { key: Resource.VapidPublicKey.value }
	},
)

// ─── registerPushSubscription ─────────────────────────────────────────────────

const registerInput = z.object({
	endpoint: z.string().url(),
	p256dh: z.string(),
	auth: z.string(),
	userAgent: z.string().optional(),
})

export const registerPushSubscription = authenticatedAction
	.inputSchema(registerInput)
	.action(
		async ({
			parsedInput: { endpoint, p256dh, auth: authKey, userAgent },
			ctx,
		}): Promise<{ ok: true }> => {
			await db.userPushSubscription.upsert({
				where: { endpoint },
				create: {
					user_id: ctx.user.id,
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
		},
	)

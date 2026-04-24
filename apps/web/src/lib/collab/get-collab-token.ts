"use server"

import { auth } from "@/lib/auth"
import { cookies } from "next/headers"

/**
 * Returns the current user's OpenAuth access token for use with the
 * Hocuspocus collaborative editing server.
 *
 * `auth()` refreshes the access-token cookie if it has expired, so the
 * value we read afterwards is always the freshest available token.
 *
 * Security note: this exposes the user's access token to client-side JS
 * so the browser can forward it to Hocuspocus over WebSocket. This is the
 * same trust level as any bearer-token-over-WebSocket scheme. For paid
 * rollout, consider minting a short-lived collab-scoped JWT instead.
 */
export async function getCollabToken(): Promise<string | null> {
	const session = await auth()
	if (!session) return null

	const cookieStore = await cookies()
	const accessToken = cookieStore.get("access_token")
	return accessToken?.value ?? null
}

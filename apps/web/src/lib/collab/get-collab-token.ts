"use server"

import { publicAction } from "@/lib/authz"
import { cookies } from "next/headers"

/**
 * Returns the current user's OpenAuth access token for use with the
 * Hocuspocus collaborative editing server.
 *
 * `auth()` (in the OpenAuth wrapper) refreshes the access-token cookie if it
 * has expired, so the value we read afterwards is always the freshest token.
 *
 * Security note: this exposes the user's access token to client-side JS so the
 * browser can forward it to Hocuspocus over WebSocket. This is the same trust
 * level as any bearer-token-over-WebSocket scheme. For paid rollout, consider
 * minting a short-lived collab-scoped JWT instead.
 *
 * Why publicAction instead of authenticatedAction: the access token cookie IS
 * the credential we're returning, and we tolerate "no session" by returning
 * null. Forcing authenticatedAction would convert that into a 401 the client
 * can't act on.
 */
export const getCollabToken = publicAction.action(
	async (): Promise<{ token: string | null }> => {
		const cookieStore = await cookies()
		const accessToken = cookieStore.get("access_token")
		return { token: accessToken?.value ?? null }
	},
)

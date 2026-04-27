"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export type CurrentUserProfile = {
	id: string
	name: string | null
	email: string | null
	avatar_url: string | null
}

export type GetCurrentUserResult =
	| { ok: true; user: CurrentUserProfile }
	| { ok: false; error: string }

/**
 * Returns the logged-in user's display profile (id + name + email).
 * Used by collaborative features that need to show "who is editing" —
 * e.g. the CollaborationCursor caret label in `AnnotatedAnswerSheet`.
 */
export async function getCurrentUser(): Promise<GetCurrentUserResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const row = await db.user.findUnique({
		where: { id: session.userId },
		select: { id: true, name: true, email: true, avatar_url: true },
	})

	if (!row) return { ok: false, error: "User not found" }
	return { ok: true, user: row }
}

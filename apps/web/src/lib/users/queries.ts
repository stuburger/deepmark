"use server"

import { authenticatedAction } from "@/lib/authz"
import { db } from "@/lib/db"

export type CurrentUserProfile = {
	id: string
	name: string | null
	email: string | null
	avatar_url: string | null
}

/**
 * Returns the logged-in user's display profile (id + name + email).
 * Used by collaborative features that need to show "who is editing" —
 * e.g. the CollaborationCursor caret label in `AnnotatedAnswerSheet`.
 */
export const getCurrentUser = authenticatedAction.action(
	async ({ ctx }): Promise<{ user: CurrentUserProfile | null }> => {
		const row = await db.user.findUnique({
			where: { id: ctx.user.id },
			select: { id: true, name: true, email: true, avatar_url: true },
		})
		return { user: row ?? null }
	},
)

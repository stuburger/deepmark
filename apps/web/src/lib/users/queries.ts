"use server"

import { authenticatedAction } from "@/lib/authz"
import { db } from "@/lib/db"
import type { UserRole } from "@mcp-gcse/db"

export type CurrentUserProfile = {
	id: string
	name: string | null
	email: string | null
	avatar_url: string | null
	role: UserRole
}

/**
 * Returns the logged-in user's display profile (id + name + email + role).
 * Used by collaborative features that need to show "who is editing" —
 * e.g. the CollaborationCursor caret label in `AnnotatedAnswerSheet` —
 * and by client components that gate admin-only UI on `role === "admin"`.
 */
export const getCurrentUser = authenticatedAction.action(
	async ({ ctx }): Promise<{ user: CurrentUserProfile | null }> => {
		const row = await db.user.findUnique({
			where: { id: ctx.user.id },
			select: {
				id: true,
				name: true,
				email: true,
				avatar_url: true,
				role: true,
			},
		})
		return { user: row ?? null }
	},
)

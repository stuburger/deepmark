"use client"

import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { type CurrentUserProfile, getCurrentUser } from "./queries"

/**
 * Deterministic HSL color from a userId. Stable across reloads, distinct
 * per user. Used as the awareness cursor color for collaborative editing.
 */
export function colorForUserId(id: string): string {
	let hash = 0
	for (let i = 0; i < id.length; i++) {
		hash = (hash * 31 + id.charCodeAt(i)) | 0
	}
	const hue = ((hash % 360) + 360) % 360
	return `hsl(${hue} 70% 50%)`
}

export type CursorUser = {
	name: string
	color: string
}

export function useCurrentUser(): {
	user: CurrentUserProfile | null
	cursorUser: CursorUser | null
} {
	const { data } = useQuery({
		queryKey: queryKeys.currentUser(),
		queryFn: async () => {
			const r = await getCurrentUser()
			return r.ok ? r.user : null
		},
		staleTime: Number.POSITIVE_INFINITY,
	})

	if (!data) return { user: null, cursorUser: null }

	const displayName = data.name?.trim() || data.email?.split("@")[0] || "Teacher"
	return {
		user: data,
		cursorUser: { name: displayName, color: colorForUserId(data.id) },
	}
}

"use client"

import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { type CurrentUserProfile, getCurrentUser } from "./queries"

function hueForUserId(id: string): number {
	let hash = 0
	for (let i = 0; i < id.length; i++) {
		hash = (hash * 31 + id.charCodeAt(i)) | 0
	}
	return ((hash % 360) + 360) % 360
}

/**
 * Deterministic HSL color from a userId. Stable across reloads, distinct
 * per user. Used as the awareness cursor color for collaborative editing.
 */
export function colorForUserId(id: string): string {
	return `hsl(${hueForUserId(id)} 70% 50%)`
}

/**
 * Translucent variant of `colorForUserId` for selection highlights — opaque
 * enough to read against, light enough to show the underlying text.
 *
 * Why this exists: y-tiptap's default selectionRender appends a hex alpha
 * byte (`${color}70`) to the user color, which produces invalid CSS for
 * any non-hex color (HSL etc). Passing a pre-computed `hsl(... / α)` string
 * sidesteps that.
 */
export function selectionColorForUserId(id: string, alpha = 0.3): string {
	return `hsl(${hueForUserId(id)} 70% 50% / ${alpha})`
}

export type CursorUser = {
	name: string
	color: string
	/** Pre-computed translucent variant — read by the custom selectionRender. */
	selectionColor: string
	/** Profile image URL (Google `picture` claim) — null for users without one. */
	image: string | null
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

	const displayName =
		data.name?.trim() || data.email?.split("@")[0] || "Teacher"
	return {
		user: data,
		cursorUser: {
			name: displayName,
			color: colorForUserId(data.id),
			selectionColor: selectionColorForUserId(data.id),
			image: data.avatar_url,
		},
	}
}

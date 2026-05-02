"use client"

import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { type CurrentUserProfile, getCurrentUser } from "./queries"

/**
 * Curated palette of 6-digit hex collab colors. Distinct hues, friendly on
 * white, and avoids pure red/yellow (those code as "error"/"warning" in the
 * rest of the UI).
 *
 * Hex format is mandatory: y-tiptap's cursor plugin validates `user.color`
 * with `^#[0-9a-fA-F]{6}$` and emits `console.warn("A user uses an
 * unsupported color format", user)` every time decorations rebuild
 * (i.e. on every awareness change). Non-hex colors trigger the warn loop,
 * which blocks the main thread under DevTools and shows up as cursor
 * flicker even without it.
 */
const PALETTE = [
	"#3b82f6", // blue
	"#10b981", // emerald
	"#8b5cf6", // violet
	"#ec4899", // pink
	"#f59e0b", // amber
	"#06b6d4", // cyan
	"#ef4444", // red
	"#84cc16", // lime
	"#a855f7", // purple
	"#14b8a6", // teal
	"#f97316", // orange
	"#6366f1", // indigo
] as const

function paletteIndexFor(id: string): number {
	let hash = 0
	for (let i = 0; i < id.length; i++) {
		hash = (hash * 31 + id.charCodeAt(i)) | 0
	}
	return Math.abs(hash) % PALETTE.length
}

/**
 * Deterministic hex color from a userId. Stable across reloads, distinct
 * per user. Used as the awareness cursor color for collaborative editing.
 */
export function colorForUserId(id: string): string {
	return PALETTE[paletteIndexFor(id)] ?? PALETTE[0]
}

/**
 * Translucent variant of `colorForUserId` for selection highlights.
 * Uses 8-digit hex (`#rrggbbaa`) so it's still valid CSS and still passes
 * y-tiptap's color regex if it ever ends up in `user.color`.
 */
export function selectionColorForUserId(id: string, alpha = 0.3): string {
	const hex = PALETTE[paletteIndexFor(id)] ?? PALETTE[0]
	const alphaByte = Math.round(alpha * 255)
		.toString(16)
		.padStart(2, "0")
	return `${hex}${alphaByte}`
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
	isAdmin: boolean
} {
	const { data } = useQuery({
		queryKey: queryKeys.currentUser(),
		queryFn: async () => {
			const r = await getCurrentUser()
			return r?.data?.user ?? null
		},
		staleTime: Number.POSITIVE_INFINITY,
	})

	if (!data) return { user: null, cursorUser: null, isAdmin: false }

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
		isAdmin: data.role === "admin",
	}
}

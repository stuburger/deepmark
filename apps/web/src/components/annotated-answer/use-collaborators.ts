"use client"

import type { HocuspocusProvider } from "@hocuspocus/provider"
import { useEffect, useState } from "react"

export type Collaborator = {
	clientId: number
	name: string
	color: string
	image: string | null
}

/**
 * Subscribes to a Hocuspocus provider's awareness state and returns the list
 * of connected users excluding the local client. Each entry's identity is
 * pulled from `state.user`, which is set by the CollaborationCaret extension
 * (and by `editor.commands.updateUser(...)` afterwards).
 *
 * Re-renders only when membership/identity actually changes — peers are keyed
 * by clientId so transient awareness updates from cursor moves don't churn.
 */
export function useCollaborators(
	provider: HocuspocusProvider | null | undefined,
): Collaborator[] {
	const [peers, setPeers] = useState<Collaborator[]>([])

	useEffect(() => {
		if (!provider?.awareness) {
			setPeers([])
			return
		}
		const awareness = provider.awareness

		function snapshot(): Collaborator[] {
			const out: Collaborator[] = []
			for (const [clientId, state] of awareness.getStates()) {
				if (clientId === awareness.clientID) continue
				const user = (state as { user?: Record<string, unknown> }).user
				if (!user || typeof user !== "object") continue
				const name = typeof user.name === "string" ? user.name : "Anonymous"
				const color = typeof user.color === "string" ? user.color : "#888"
				const image = typeof user.image === "string" ? user.image : null
				out.push({ clientId, name, color, image })
			}
			return out
		}

		setPeers(snapshot())

		// Identity-aware update: skip re-renders when only cursor positions
		// change. The awareness "change" event fires on every cursor tick.
		const onChange = () => {
			setPeers((prev) => {
				const next = snapshot()
				if (next.length !== prev.length) return next
				for (let i = 0; i < next.length; i++) {
					const a = next[i]
					const b = prev[i]
					if (
						a.clientId !== b.clientId ||
						a.name !== b.name ||
						a.color !== b.color ||
						a.image !== b.image
					) {
						return next
					}
				}
				return prev
			})
		}

		awareness.on("change", onChange)
		return () => {
			awareness.off("change", onChange)
		}
	}, [provider])

	return peers
}

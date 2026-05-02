"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type { CSSProperties } from "react"
import type { Collaborator } from "./use-collaborators"

function initialsFor(name: string): string {
	const parts = name.trim().split(/\s+/).slice(0, 2)
	return (
		parts
			.map((p) => p[0]?.toUpperCase() ?? "")
			.join("")
			.slice(0, 2) || "?"
	)
}

type AvatarChipUser = {
	name: string
	color: string
	image: string | null
}

function AvatarChip({
	user,
	tooltip,
}: {
	user: AvatarChipUser
	tooltip: string
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<div
						className="relative rounded-full"
						style={
							{
								// Inner colored ring (user's color) + outer background
								// gap so adjacent avatars stay visually separated.
								boxShadow: `0 0 0 2px ${user.color}, 0 0 0 4px var(--background)`,
							} as CSSProperties
						}
					>
						<Avatar size="sm">
							{user.image ? (
								<AvatarImage src={user.image} alt={user.name} />
							) : null}
							<AvatarFallback
								style={{ backgroundColor: user.color, color: "white" }}
							>
								{initialsFor(user.name)}
							</AvatarFallback>
						</Avatar>
					</div>
				}
			/>
			<TooltipContent side="bottom">{tooltip}</TooltipContent>
		</Tooltip>
	)
}

/**
 * Google-Docs-style overlapping avatar stack. Each avatar gets a 2px ring in
 * its owner's collab color (matches their caret + selection highlight) so a
 * teacher's identity is consistent across the toolbar and the document.
 *
 * `self` (the current user) renders at the leading edge with a "You" tooltip.
 * It's rendered independently of `users` (which excludes the local client by
 * design) so the avatar always shows — even when the Hocuspocus provider is
 * still connecting or running in indexeddb-only mode.
 */
export function CollaboratorAvatars({
	users,
	self,
}: {
	users: Collaborator[]
	self?: AvatarChipUser | null
}) {
	if (!self && users.length === 0) return null

	return (
		<div className="flex -space-x-2">
			{self && (
				<AvatarChip key="self" user={self} tooltip={`${self.name} (You)`} />
			)}
			{users.map((u) => (
				<AvatarChip key={u.clientId} user={u} tooltip={u.name} />
			))}
		</div>
	)
}

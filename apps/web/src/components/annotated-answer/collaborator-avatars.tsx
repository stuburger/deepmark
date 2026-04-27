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

/**
 * Google-Docs-style overlapping avatar stack. Each avatar gets a 2px ring in
 * its owner's collab color (matches their caret + selection highlight) so a
 * teacher's identity is consistent across the toolbar and the document.
 */
export function CollaboratorAvatars({ users }: { users: Collaborator[] }) {
	if (users.length === 0) return null

	return (
		<div className="flex -space-x-2">
			{users.map((u) => (
				<Tooltip key={u.clientId}>
					<TooltipTrigger
						render={
							<div
								className="relative rounded-full"
								style={
									{
										// Inner colored ring (user's color) + outer background
										// gap so adjacent avatars stay visually separated.
										boxShadow: `0 0 0 2px ${u.color}, 0 0 0 4px var(--background)`,
									} as CSSProperties
								}
							>
								<Avatar size="sm">
									{u.image ? <AvatarImage src={u.image} alt={u.name} /> : null}
									<AvatarFallback
										style={{ backgroundColor: u.color, color: "white" }}
									>
										{initialsFor(u.name)}
									</AvatarFallback>
								</Avatar>
							</div>
						}
					/>
					<TooltipContent side="bottom">{u.name}</TooltipContent>
				</Tooltip>
			))}
		</div>
	)
}

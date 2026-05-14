"use client"

import { cn } from "@/lib/utils"
import { Check } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Inline label that animates a green editor-style highlight + trailing check
 * when the matching file is classified. Mirrors the editor's "tick" mark so
 * the wizard heading reads as the acquisition checklist itself: "Drop in your
 * question paper, mark scheme, and scripts".
 */
export function AcquiredLabel({
	acquired,
	children,
}: {
	acquired: boolean
	children: ReactNode
}) {
	return (
		<span
			className={cn(
				"transition-colors duration-300 ease-out",
				acquired && "bg-success-200 px-0.5 text-foreground",
			)}
		>
			{children}
			<Check
				aria-hidden
				className={cn(
					"inline-block text-success transition-all duration-300 ease-out",
					acquired
						? "ml-0.5 size-3.5 opacity-100 scale-100"
						: "ml-0 size-0 opacity-0 scale-50",
				)}
			/>
		</span>
	)
}

"use client"

import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { AtSign, X } from "lucide-react"
import type { Prefill } from "../types"

/**
 * Compact chip surfacing a selected passage in chat. Two modes:
 *   - editable (onRemove set): renders the X so the teacher can drop the
 *     chip before sending.
 *   - read-only (onRemove omitted): renders inside a sent user bubble so
 *     the teacher can see what they were referring to.
 *
 * Tooltip preview shows the full selection text (capped at ~240 chars).
 * Must be rendered inside a TooltipProvider (the chat shell provides one).
 */
export function ChipBadge({
	chip,
	onRemove,
}: {
	chip: Prefill
	onRemove?: () => void
}) {
	const label = chip.questionNumber ? `Q${chip.questionNumber}` : "Selection"
	const preview =
		chip.text.length > 240 ? `${chip.text.slice(0, 240)}…` : chip.text
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<span
						className={cn(
							"inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-foreground/95 py-0.5 text-[11px] font-medium text-primary",
							onRemove ? "pl-1.5 pr-0.5" : "px-1.5",
						)}
					>
						<AtSign className="h-2.5 w-2.5 text-primary" aria-hidden />
						<span className="font-mono">{label}</span>
						{onRemove ? (
							<button
								type="button"
								onClick={onRemove}
								aria-label={`Remove ${label} context`}
								className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-sm text-background/60 hover:text-background hover:bg-white/10 transition-colors"
							>
								<X className="h-2.5 w-2.5" aria-hidden />
							</button>
						) : null}
					</span>
				}
			/>
			<TooltipContent side="top" sideOffset={4} className="max-w-xs">
				<span className="block whitespace-pre-wrap text-xs leading-snug">
					{preview}
				</span>
			</TooltipContent>
		</Tooltip>
	)
}

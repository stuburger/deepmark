"use client"

import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// ─── Grouped toggle button (shares border with siblings) ──────────────────────

export function GroupToggle({
	active,
	disabled,
	disabledReason,
	onClick,
	icon,
	label,
	position = "middle",
}: {
	active: boolean
	disabled: boolean
	disabledReason?: string
	onClick: () => void
	icon: React.ReactNode
	label: string
	position?: "first" | "middle" | "last"
}) {
	const btn = (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-pressed={active}
			className={cn(
				"inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors",
				"border-y border-r",
				position === "first" && "rounded-l-md border-l",
				position === "last" && "rounded-r-md",
				active
					? "bg-foreground text-background border-foreground z-10"
					: "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground",
				disabled && "opacity-40 pointer-events-none",
			)}
		>
			{icon}
			<span className="hidden sm:inline">{label}</span>
		</button>
	)

	if (disabled && disabledReason) {
		return (
			<Tooltip>
				<TooltipTrigger render={<span>{btn}</span>} />
				<TooltipContent side="bottom" sideOffset={6}>
					{disabledReason}
				</TooltipContent>
			</Tooltip>
		)
	}

	return btn
}

// ─── Score badge ──────────────────────────────────────────────────────────────

export function ScoreBadge({ awarded, max }: { awarded: number; max: number }) {
	if (max === 0) return null
	const pct = Math.round((awarded / max) * 100)
	const colour =
		pct >= 70
			? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
			: pct >= 40
				? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
				: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"

	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
				colour,
			)}
		>
			{awarded}/{max} · {pct}%
		</span>
	)
}

export function GradeBadge({ grade }: { grade: string }) {
	const numeric = Number(grade)
	const colour = Number.isNaN(numeric)
		? "bg-muted text-muted-foreground"
		: numeric >= 7
			? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
			: numeric >= 4
				? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
				: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"

	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
				colour,
			)}
			title="Computed from grade boundaries"
		>
			Grade {grade}
		</span>
	)
}

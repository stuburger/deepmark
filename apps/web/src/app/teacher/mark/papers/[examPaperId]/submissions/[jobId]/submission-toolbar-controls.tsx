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
//
// Solid coloured pill — high-signal at a glance per Geoff's v5 script-reader
// design (`.score-pill .full/.part/.low`). Uses our --success / --warning /
// --destructive tokens directly so the colour space stays inside the design
// system. Square corners (5px) per our no-pills rule, mono numerals.

export function ScoreBadge({ awarded, max }: { awarded: number; max: number }) {
	if (max === 0) return null
	const pct = Math.round((awarded / max) * 100)
	const colour =
		pct >= 70
			? "bg-success text-white"
			: pct >= 40
				? "bg-warning text-white"
				: "bg-destructive text-white"

	return (
		<span
			className={cn(
				"inline-flex items-center rounded-md px-3 py-0.5 font-mono text-[11px] font-bold tabular-nums",
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
			? "bg-success text-white"
			: numeric >= 4
				? "bg-warning text-white"
				: "bg-destructive text-white"

	return (
		<span
			className={cn(
				"inline-flex items-center rounded-md px-3 py-0.5 font-mono text-[11px] font-bold",
				colour,
			)}
			title="Computed from grade boundaries"
		>
			Grade {grade}
		</span>
	)
}

import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import type { DashboardPaper } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

const STATUS_LABEL: Record<DashboardPaper["status"], string> = {
	setup: "Setup",
	ready: "Ready",
	marking: "Marking",
	review: "Review",
	done: "Done",
}

const STATUS_BADGE_VARIANT: Record<
	DashboardPaper["status"],
	| "status-setup"
	| "status-ready"
	| "status-marking"
	| "status-review"
	| "status-done"
> = {
	setup: "status-setup",
	ready: "status-ready",
	marking: "status-marking",
	review: "status-review",
	done: "status-done",
}

// Progress bar fill — direct utilities so we don't ripple --status-* changes
// through other consumers.
//   amber  → setup, review (action needed by you)
//   green  → ready (drop scripts in)
//   neutral → marking (AI's turn, fades into background)
//   teal   → done (brand-positive: closed loop)
const STATUS_FILL: Record<DashboardPaper["status"], string> = {
	setup: "bg-warning",
	ready: "bg-success",
	marking: "bg-foreground/15",
	review: "bg-warning",
	done: "bg-primary",
}

// Active states carry the v1.1 hard SE-offset shadow; resting states (ready,
// done) render flat so the eye is drawn to the live work.
const STATUS_SHADOW: Record<DashboardPaper["status"], string> = {
	setup: "shadow-tile",
	ready: "shadow-none",
	marking: "shadow-tile",
	review: "shadow-tile",
	done: "shadow-none",
}

export function DashboardPaperCard({ paper }: { paper: DashboardPaper }) {
	return (
		<Link
			href={`/teacher/exam-papers/${paper.id}`}
			className={cn(
				"flex min-h-[132px] flex-col gap-2.5 rounded-md border border-border-subtle bg-card",
				"px-4 pt-4 pb-3 transition-transform hover:-translate-y-0.5",
				STATUS_SHADOW[paper.status],
			)}
		>
			<div className="font-mono text-[9px] font-bold tracking-[0.1em] uppercase text-ink-tertiary">
				{paper.subject}
			</div>
			<div className="flex-1 text-[13px] font-medium leading-snug text-foreground">
				{paper.title}
			</div>
			<div
				aria-hidden
				className="h-[2px] w-full overflow-hidden rounded-[2px] bg-foreground/5"
			>
				<div
					className={cn(
						"h-full rounded-[2px] transition-[width] duration-500 ease-out",
						STATUS_FILL[paper.status],
					)}
					style={{ width: `${paper.progress}%` }}
				/>
			</div>
			<div className="flex items-center justify-between border-t border-border-quiet pt-2.5">
				<span className="font-mono text-[10px] tabular-nums text-ink-tertiary">
					{paper.scriptCount} {paper.scriptCount === 1 ? "script" : "scripts"}
				</span>
				<Badge variant={STATUS_BADGE_VARIANT[paper.status]}>
					{STATUS_LABEL[paper.status]}
				</Badge>
			</div>
		</Link>
	)
}

export function DashboardEmptyCardSlot() {
	return (
		<div
			aria-hidden
			className="min-h-[132px] rounded-md border border-dashed border-border-quiet bg-card/40"
		/>
	)
}

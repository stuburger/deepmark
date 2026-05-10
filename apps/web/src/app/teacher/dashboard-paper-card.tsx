import Link from "next/link"

import type { DashboardPaper } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

const STATUS_LABEL: Record<DashboardPaper["status"], string> = {
	marking: "Marking",
	review: "Review",
	done: "Done",
}

const STATUS_FILL: Record<DashboardPaper["status"], string> = {
	marking: "bg-primary/55",
	review: "bg-success/50",
	done: "bg-foreground/15",
}

const STATUS_PILL: Record<DashboardPaper["status"], string> = {
	marking: "bg-teal-50 text-teal-700",
	review: "bg-success-50 text-success-800",
	done: "bg-muted text-ink-tertiary",
}

export function DashboardPaperCard({ paper }: { paper: DashboardPaper }) {
	return (
		<Link
			href={`/teacher/exam-papers/${paper.id}`}
			className={cn(
				"group/card flex min-h-[132px] flex-col gap-2.5 rounded-md",
				"border border-border-quiet bg-card shadow-card",
				"px-[18px] pt-4 pb-3.5",
				"transition-[transform,box-shadow] duration-200",
				"hover:-translate-y-0.5 hover:shadow-card-hover",
			)}
		>
			<div className="font-mono text-[9px] font-bold tracking-[0.1em] uppercase text-foreground/20">
				{paper.subject}
			</div>
			<div className="flex-1 text-[13px] font-semibold leading-[1.32] tracking-[-0.01em] text-foreground">
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
				<span className="font-mono text-[11px] font-medium tabular-nums text-ink-tertiary">
					{paper.scriptCount} {paper.scriptCount === 1 ? "script" : "scripts"}
				</span>
				<span
					className={cn(
						"rounded-[4px] px-2.5 py-[3px] text-[10px] font-bold uppercase tracking-[0.05em]",
						STATUS_PILL[paper.status],
					)}
				>
					{STATUS_LABEL[paper.status]}
				</span>
			</div>
		</Link>
	)
}

export function DashboardEmptyCardSlot() {
	return (
		<div
			aria-hidden
			className="min-h-[132px] rounded-md border border-dashed border-border-quiet bg-card/30"
		/>
	)
}

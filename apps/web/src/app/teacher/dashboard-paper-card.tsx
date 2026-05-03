import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import type { DashboardPaper } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

const STATUS_BORDER: Record<DashboardPaper["status"], string> = {
	marking: "border-status-marking",
	review: "border-status-review",
	done: "border-status-done",
}

// Per Geoff's v2 spec: active tiles (marking, review) carry the standard tile
// shadow; inactive (done) tiles render flat for quick state recognition.
const STATUS_SHADOW: Record<DashboardPaper["status"], string> = {
	marking: "shadow-tile",
	review: "shadow-tile",
	done: "shadow-none",
}

const STATUS_LABEL: Record<DashboardPaper["status"], string> = {
	marking: "Marking",
	review: "Review",
	done: "Done",
}

const STATUS_BADGE_VARIANT: Record<
	DashboardPaper["status"],
	"status-marking" | "status-review" | "status-done"
> = {
	marking: "status-marking",
	review: "status-review",
	done: "status-done",
}

type DashboardPaperCardProps = {
	paper: DashboardPaper
}

export function DashboardPaperCard({ paper }: DashboardPaperCardProps) {
	return (
		<Link
			href={`/teacher/exam-papers/${paper.id}`}
			className={cn(
				"flex flex-col gap-0 rounded-md bg-card p-4 transition-transform hover:-translate-y-0.5",
				"min-h-[96px] border-[1.5px]",
				STATUS_BORDER[paper.status],
				STATUS_SHADOW[paper.status],
			)}
		>
			<div className="font-mono text-[9px] tracking-[0.1em] uppercase text-ink-tertiary mb-1.5">
				{paper.subject}
			</div>
			<div className="text-[13px] font-medium leading-snug text-foreground flex-1 mb-3.5">
				{paper.title}
			</div>
			<div className="flex items-center justify-between mt-auto">
				<span className="font-mono text-[10px] text-ink-tertiary">
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
			className="flex min-h-[96px] flex-col gap-0 rounded-md border-[1.5px] border-border-quiet bg-card/50 p-4 shadow-tile-quiet"
		/>
	)
}

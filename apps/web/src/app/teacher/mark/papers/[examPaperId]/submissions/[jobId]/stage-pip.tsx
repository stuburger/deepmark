"use client"

import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import type { Stage, StageKey, StageStatus } from "@/lib/marking/stages/types"
import { cn } from "@/lib/utils"
import { RefreshCw } from "lucide-react"

const LABELS: Record<StageKey, string> = {
	ocr: "Extraction",
	grading: "Grading",
	enrichment: "Annotation",
}

const DOT_CLASS: Record<StageStatus, string> = {
	not_started: "bg-orange-400",
	generating: "bg-blue-500 animate-pulse",
	done: "bg-emerald-500",
	failed: "bg-red-500",
	cancelled: "bg-zinc-400",
}

const STATUS_LABEL: Record<StageStatus, string> = {
	not_started: "Not started",
	generating: "In progress",
	done: "Done",
	failed: "Failed",
	cancelled: "Cancelled",
}

function formatDuration(start: Date | null, end: Date | null): string | null {
	if (!start || !end) return null
	const ms = end.getTime() - start.getTime()
	if (ms < 1000) return `${ms}ms`
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
	return `${Math.round(ms / 1000)}s`
}

export function StagePip({
	stageKey,
	stage,
	onRerun,
	rerunDisabled,
}: {
	stageKey: StageKey
	stage: Stage
	onRerun?: () => void
	rerunDisabled?: boolean
}) {
	const label = LABELS[stageKey]
	const duration = formatDuration(stage.startedAt, stage.completedAt)

	return (
		<Popover>
			<PopoverTrigger
				className={cn(
					"inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground transition-colors",
					"hover:bg-muted hover:text-foreground",
					"data-popup-open:bg-muted data-popup-open:text-foreground",
				)}
				aria-label={`${label}: ${STATUS_LABEL[stage.status]}`}
			>
				<span
					className={cn(
						"h-2 w-2 shrink-0 rounded-full",
						DOT_CLASS[stage.status],
					)}
				/>
				<span className="hidden sm:inline">{label}</span>
			</PopoverTrigger>
			<PopoverContent side="bottom" sideOffset={6} className="w-64 p-3 text-xs">
				<div className="flex items-center justify-between">
					<span className="font-medium text-foreground">{label}</span>
					<span className="text-muted-foreground">
						{STATUS_LABEL[stage.status]}
					</span>
				</div>

				{stage.error && (
					<p className="mt-2 rounded bg-red-50 p-2 text-red-700 dark:bg-red-950/30 dark:text-red-400">
						{stage.error}
					</p>
				)}

				<dl className="mt-2 space-y-1 text-muted-foreground">
					{stage.startedAt && (
						<div className="flex justify-between gap-2">
							<dt>Started</dt>
							<dd>{stage.startedAt.toLocaleTimeString()}</dd>
						</div>
					)}
					{stage.completedAt && (
						<div className="flex justify-between gap-2">
							<dt>Completed</dt>
							<dd>{stage.completedAt.toLocaleTimeString()}</dd>
						</div>
					)}
					{duration && (
						<div className="flex justify-between gap-2">
							<dt>Duration</dt>
							<dd>{duration}</dd>
						</div>
					)}
				</dl>

				{onRerun && (
					<button
						type="button"
						onClick={onRerun}
						disabled={rerunDisabled}
						className={cn(
							"mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors",
							"hover:bg-muted",
							"disabled:opacity-50 disabled:pointer-events-none",
						)}
					>
						<RefreshCw className="h-3 w-3" />
						Re-run {label.toLowerCase()}
					</button>
				)}
			</PopoverContent>
		</Popover>
	)
}

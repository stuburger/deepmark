"use client"

import { Button } from "@/components/ui/button"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { History, Loader2, Trash2 } from "lucide-react"
import {
	TERMINAL_STATUSES,
	formatDate,
	scoreColour,
	statusDot,
	statusLabel,
} from "./submission-grid-config"

export function ScriptListItem({
	sub,
	onView,
	onDeleteRequest,
}: {
	sub: SubmissionHistoryItem
	onView: () => void
	onDeleteRequest: () => void
}) {
	const pct =
		sub.total_max > 0
			? Math.round((sub.total_awarded / sub.total_max) * 100)
			: null
	const colours = scoreColour(pct)
	const dot = statusDot(sub.status, pct)
	const isInProgress = !TERMINAL_STATUSES.has(sub.status)
	const hasVersions = (sub.version_count ?? 1) > 1

	return (
		<li>
			{/* biome-ignore lint/a11y/useSemanticElements: nested <Button> inside a <button> would violate HTML spec and cause hydration errors */}
			<div
				role="button"
				tabIndex={0}
				onClick={onView}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault()
						onView()
					}
				}}
				className="group/row flex w-full items-center gap-3 rounded-lg bg-card px-3 py-2.5 ring-1 ring-foreground/10 transition-shadow hover:ring-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer sm:px-4 sm:py-3"
			>
				<span
					className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`}
					title={statusLabel(sub.status)}
				/>

				<div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
					<p className="min-w-0 flex-1 truncate text-sm font-medium">
						{sub.student_name ?? (
							<span className="italic text-muted-foreground">
								Unnamed student
							</span>
						)}
					</p>

					<div className="flex items-center gap-2 sm:gap-3">
						{pct !== null ? (
							<span
								className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${colours?.chip}`}
							>
								{sub.total_awarded}/{sub.total_max}
								<span className="font-bold">{pct}%</span>
							</span>
						) : (
							<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground capitalize">
								{isInProgress && <Loader2 className="h-3 w-3 animate-spin" />}
								{statusLabel(sub.status)}
							</span>
						)}

						{hasVersions && (
							<span
								className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground"
								title={`${sub.version_count} versions`}
							>
								<History className="h-3 w-3" />v{sub.version_count}
							</span>
						)}

						<span className="ml-auto text-xs text-muted-foreground tabular-nums sm:ml-0">
							{formatDate(sub.created_at)}
						</span>
					</div>
				</div>

				<Button
					variant="ghost"
					size="icon-xs"
					onClick={(e) => {
						e.stopPropagation()
						onDeleteRequest()
					}}
					className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/row:opacity-100 focus-visible:opacity-100"
					title="Delete submission"
				>
					<Trash2 className="h-3.5 w-3.5" />
				</Button>
			</div>
		</li>
	)
}

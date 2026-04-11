"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { History, Loader2, Trash2 } from "lucide-react"
import {
	TERMINAL_STATUSES,
	formatDate,
	scoreColour,
	statusDot,
	statusLabel,
} from "./submission-grid-config"

export function ScriptCard({
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

	return (
		// biome-ignore lint/a11y/useSemanticElements: can't use <button> — nested <Button> inside would violate HTML spec and cause hydration errors
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
			className="text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl cursor-pointer"
		>
			<Card className="group/script gap-0 py-0 hover:ring-foreground/20 transition-shadow cursor-pointer bg-amber-50/40 dark:bg-amber-950/10 h-full">
				<CardHeader className="pt-4 pb-0 px-4">
					<div className="flex items-start justify-between gap-2">
						<p className="text-sm font-medium italic leading-snug line-clamp-1 flex-1">
							{sub.student_name ?? (
								<span className="text-muted-foreground not-italic">
									Unnamed student
								</span>
							)}
						</p>
						<div className="flex items-center gap-1.5 shrink-0">
							{/* Delete button */}
							<Button
								variant="ghost"
								size="icon-xs"
								onClick={(e) => {
									e.stopPropagation()
									onDeleteRequest()
								}}
								className="opacity-0 group-hover/script:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
								title="Delete submission"
							>
								<Trash2 className="h-3.5 w-3.5" />
							</Button>
							{/* Version badge */}
							{(sub.version_count ?? 1) > 1 && (
								<span
									className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground"
									title={`${sub.version_count} versions`}
								>
									<History className="h-3 w-3" />v{sub.version_count}
								</span>
							)}
							{/* Status dot */}
							<span
								className={`mt-0.5 h-2.5 w-2.5 rounded-full ${dot}`}
								title={statusLabel(sub.status)}
							/>
						</div>
					</div>
				</CardHeader>

				{/* Ruled lines — the notebook motif */}
				<CardContent className="px-4 pt-3 pb-2 flex flex-col gap-2.5">
					<div className="border-b border-muted/70" />
					<div className="border-b border-muted/70" />
					<div className="border-b border-muted/70" />
					<div className="border-b border-muted/70" />
				</CardContent>

				<CardFooter className="px-4 py-3 flex items-center justify-between border-t bg-muted/30">
					{pct !== null ? (
						<span
							className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ${colours?.chip}`}
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
					<span className="text-xs text-muted-foreground tabular-nums">
						{formatDate(sub.created_at)}
					</span>
				</CardFooter>
			</Card>
		</div>
	)
}

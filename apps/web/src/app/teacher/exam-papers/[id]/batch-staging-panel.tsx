"use client"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import type { ActiveBatchInfo } from "@/lib/batch/types"
import { LayoutGrid, Loader2, Rows3 } from "lucide-react"
import { StagedScriptReviewCards } from "./staged-script-review-cards"
import { StagedScriptReviewList } from "./staged-script-review-list"
import { ViewToggle } from "./view-toggle"

type BatchStagingPanelProps = {
	activeBatch: ActiveBatchInfo | undefined
	committingBatch: boolean
	viewMode: "list" | "grid"
	onViewModeChange: (v: "list" | "grid") => void
	onCommitAll: () => Promise<void>
	onUpdateScriptName: (id: string, name: string) => Promise<void>
	onToggleExclude: (id: string, status: string) => Promise<void>
	onDeleteScript: () => void
}

const BACKLOG_VIEW_OPTIONS = [
	{ value: "list", icon: <Rows3 className="h-4 w-4" />, label: "List view" },
	{
		value: "grid",
		icon: <LayoutGrid className="h-4 w-4" />,
		label: "Grid view",
	},
]

export function BatchStagingPanel({
	activeBatch,
	committingBatch,
	viewMode,
	onViewModeChange,
	onCommitAll,
	onUpdateScriptName,
	onToggleExclude,
	onDeleteScript,
}: BatchStagingPanelProps) {
	if (!activeBatch) return null

	if (activeBatch.status === "classifying") {
		return (
			<div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-4">
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground shrink-0" />
				<p className="text-sm text-muted-foreground">
					Analysing upload… scripts will appear here shortly.
				</p>
			</div>
		)
	}

	if (activeBatch.status === "staging") {
		const nonExcludedCount = activeBatch.staged_scripts.filter(
			(s) => s.status !== "excluded",
		).length

		return (
			<div className="space-y-4">
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-3">
						<p className="text-sm font-medium">
							Review detected scripts before marking
						</p>
						<ViewToggle
							value={viewMode}
							onChange={onViewModeChange}
							options={BACKLOG_VIEW_OPTIONS}
						/>
					</div>
					{nonExcludedCount > 0 && (
						<Button
							size="sm"
							disabled={committingBatch}
							onClick={() => onCommitAll()}
						>
							{committingBatch ? (
								<>
									<Spinner className="h-3.5 w-3.5 mr-1.5" />
									Starting…
								</>
							) : (
								`Start marking ${nonExcludedCount} scripts`
							)}
						</Button>
					)}
				</div>

				{viewMode === "list" ? (
					<StagedScriptReviewList
						batchId={activeBatch.id}
						scripts={activeBatch.staged_scripts}
						onUpdateName={async (id, name) => {
							await onUpdateScriptName(id, name)
						}}
						onToggleExclude={async (id, status) => {
							await onToggleExclude(id, status)
						}}
						onDeleteScript={() => onDeleteScript()}
					/>
				) : (
					<StagedScriptReviewCards
						batchId={activeBatch.id}
						scripts={activeBatch.staged_scripts}
						onUpdateName={async (id, name) => {
							await onUpdateScriptName(id, name)
						}}
						onToggleExclude={async (id, status) => {
							await onToggleExclude(id, status)
						}}
						onDeleteScript={() => onDeleteScript()}
					/>
				)}
			</div>
		)
	}

	if (activeBatch.status === "marking") {
		const completedCount = activeBatch.student_jobs.filter(
			(j) => j.status === "ocr_complete",
		).length
		const total = activeBatch.total_student_jobs
		const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0

		return (
			<div className="rounded-lg border bg-muted/20 px-4 py-4 space-y-2">
				<div className="flex items-center justify-between text-sm">
					<span className="font-medium">
						{completedCount} of {total} scripts marked
					</span>
					<span className="text-muted-foreground">{percent}%</span>
				</div>
				<Progress value={total > 0 ? (completedCount / total) * 100 : 0} />
			</div>
		)
	}

	return null
}

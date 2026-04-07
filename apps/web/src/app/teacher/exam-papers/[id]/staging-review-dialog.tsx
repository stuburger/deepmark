"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import type { ActiveBatchInfo } from "@/lib/batch/types"
import { X } from "lucide-react"
import { BatchStagingPanel } from "./batch-staging-panel"

type StagingReviewDialogProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	activeBatch: ActiveBatchInfo | undefined
	committingBatch: boolean
	viewMode: "list" | "grid"
	onViewModeChange: (v: "list" | "grid") => void
	onCommitAll: () => Promise<void>
	onUpdateScriptName: (id: string, name: string) => Promise<void>
	onToggleExclude: (id: string, status: string) => Promise<void>
	onDeleteScript: () => void
	onJobDeleted?: () => void
	onViewJob?: (id: string) => void
}

export function StagingReviewDialog({
	open,
	onOpenChange,
	activeBatch,
	committingBatch,
	viewMode,
	onViewModeChange,
	onCommitAll,
	onUpdateScriptName,
	onToggleExclude,
	onDeleteScript,
	onJobDeleted,
	onViewJob,
}: StagingReviewDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="top-0! left-0! translate-x-0! translate-y-0! max-w-none! w-screen! h-screen! rounded-none! p-0 overflow-hidden ring-0 flex flex-col"
				showCloseButton={false}
			>
				{/* Header */}
				<div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
					<div>
						<h2 className="text-base font-semibold">Review scripts</h2>
						<p className="text-sm text-muted-foreground mt-0.5">
							Confirm which scripts to include, then start marking
						</p>
					</div>
					<Button
						variant="ghost"
						size="sm"
						className="h-8 w-8 p-0 text-muted-foreground"
						onClick={() => onOpenChange(false)}
					>
						<X className="h-4 w-4" />
						<span className="sr-only">Close</span>
					</Button>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-y-auto px-6 py-6">
					<BatchStagingPanel
						activeBatch={activeBatch}
						committingBatch={committingBatch}
						viewMode={viewMode}
						onViewModeChange={onViewModeChange}
						onCommitAll={onCommitAll}
						onUpdateScriptName={onUpdateScriptName}
						onToggleExclude={onToggleExclude}
						onDeleteScript={onDeleteScript}
						onJobDeleted={onJobDeleted}
						onViewJob={onViewJob}
					/>
				</div>
			</DialogContent>
		</Dialog>
	)
}

"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import type { BatchIngestionState, StagedScript } from "@/lib/batch/types"
import { X } from "lucide-react"
import { BatchStagingPanel } from "./batch-staging-panel"

type StagingReviewDialogProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	ingestion: BatchIngestionState | null
	committingBatch: boolean
	onCommitAll: () => Promise<void>
	onUpdateScriptName: (id: string, name: string) => Promise<void>
	onToggleExclude: (id: string, status: StagedScript["status"]) => Promise<void>
	onSplitScript: (scriptId: string, splitAfterIndex: number) => void
	onDeleteScript: () => void
	onAddScript: () => Promise<void>
}

export function StagingReviewDialog({
	open,
	onOpenChange,
	ingestion,
	committingBatch,
	onCommitAll,
	onUpdateScriptName,
	onToggleExclude,
	onSplitScript,
	onDeleteScript,
	onAddScript,
}: StagingReviewDialogProps) {
	const confirmedCount = ingestion
		? ingestion.unsubmittedScripts.filter((s) => s.status === "confirmed")
				.length
		: 0

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="inset-4! w-auto! translate-x-0! translate-y-0! max-w-none! rounded-2xl p-0 overflow-hidden ring-0 shadow-2xl flex flex-col"
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

				{/* Body — panels scroll individually */}
				<div className="flex-1 min-h-0">
					{ingestion ? (
						<BatchStagingPanel
							ingestion={ingestion}
							onUpdateScriptName={onUpdateScriptName}
							onToggleExclude={onToggleExclude}
							onSplitScript={onSplitScript}
							onDeleteScript={onDeleteScript}
							onAddScript={onAddScript}
						/>
					) : null}
				</div>

				{/* Footer */}
				<div className="flex items-center justify-end border-t bg-muted/50 px-6 py-4 shrink-0">
					<Button
						disabled={committingBatch || confirmedCount === 0}
						onClick={onCommitAll}
					>
						{committingBatch ? (
							<>
								<Spinner className="h-3.5 w-3.5 mr-1.5" />
								Starting…
							</>
						) : confirmedCount === 0 ? (
							"Start Marking"
						) : (
							`Start Marking ${confirmedCount} script${confirmedCount === 1 ? "" : "s"}`
						)}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}

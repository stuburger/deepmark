"use client"

import type { BatchIngestionState, StagedScript } from "@/lib/batch/types"
import { PaperTrayPanel } from "./paper-tray-panel"
import { StagedScriptReviewList } from "./staged-script-review-list"

type BatchStagingPanelProps = {
	ingestion: BatchIngestionState
	committingBatch: boolean
	onCommitAll: () => Promise<void>
	onUpdateScriptName: (id: string, name: string) => Promise<void>
	onToggleExclude: (id: string, status: string) => Promise<void>
	onSplitScript: (scriptId: string, splitAfterIndex: number) => void
	onDeleteScript: () => void
}

export function BatchStagingPanel({
	ingestion,
	committingBatch,
	onCommitAll,
	onUpdateScriptName,
	onToggleExclude,
	onSplitScript,
	onDeleteScript,
}: BatchStagingPanelProps) {
	const scripts = ingestion.unsubmittedScripts

	if (scripts.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
				<p className="text-sm font-medium">All scripts submitted for marking</p>
				<p className="text-xs text-muted-foreground">
					Check the submissions tab for progress
				</p>
			</div>
		)
	}

	return (
		<ScriptReviewLayout
			label="Review each script, then include it in the marking run"
			scripts={scripts}
			urls={ingestion.urls}
			committingBatch={committingBatch}
			onCommitAll={onCommitAll}
			onUpdateScriptName={onUpdateScriptName}
			onToggleExclude={onToggleExclude}
			onSplitScript={onSplitScript}
			onDeleteScript={onDeleteScript}
			pagesPerScript={ingestion.pagesPerScript}
			classificationMode={ingestion.classificationMode}
		/>
	)
}

// ── Shared two-column review layout ──────────────────────────────────────────

function ScriptReviewLayout({
	label,
	scripts,
	urls,
	committingBatch,
	onCommitAll,
	onUpdateScriptName,
	onToggleExclude,
	onDeleteScript,
}: {
	label: string
	scripts: StagedScript[]
	urls: Record<string, string>
	committingBatch: boolean
	onCommitAll: () => Promise<void>
	onUpdateScriptName: (id: string, name: string) => Promise<void>
	onToggleExclude: (id: string, status: string) => Promise<void>
	onSplitScript: (scriptId: string, splitAfterIndex: number) => void
	onDeleteScript: () => void
	pagesPerScript: number
	classificationMode: string
}) {
	const pendingScripts = scripts.filter((s) => s.status !== "confirmed")
	const confirmedScripts = scripts.filter((s) => s.status === "confirmed")

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3">
				<p className="text-sm font-medium text-muted-foreground">{label}</p>
			</div>

			<div className="grid grid-cols-2 gap-8 items-start">
				{/* LEFT: scripts to review */}
				<div>
					{pendingScripts.length === 0 ? (
						<div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
							<p className="text-sm font-medium">All scripts confirmed</p>
							<p className="text-xs text-muted-foreground">
								Click &ldquo;Start marking&rdquo; on the right to begin
							</p>
						</div>
					) : (
						<StagedScriptReviewList
							urls={urls}
							scripts={pendingScripts}
							onUpdateName={onUpdateScriptName}
							onToggleExclude={onToggleExclude}
							onDeleteScript={() => onDeleteScript()}
						/>
					)}
				</div>

				{/* RIGHT: confirmed scripts */}
				<div>
					<PaperTrayPanel
						urls={urls}
						confirmedScripts={confirmedScripts}
						committingBatch={committingBatch}
						onCommitAll={onCommitAll}
						onToggleExclude={onToggleExclude}
					/>
				</div>
			</div>
		</div>
	)
}

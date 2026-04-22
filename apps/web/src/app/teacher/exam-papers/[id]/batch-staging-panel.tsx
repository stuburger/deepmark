"use client"

import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable"
import type { BatchIngestionState, StagedScript } from "@/lib/batch/types"
import type { ClassificationMode } from "@mcp-gcse/db"
import { useRef, useState } from "react"
import { PaperTrayPanel } from "./paper-tray-panel"
import {
	type DeletedPage,
	StagedScriptReviewList,
	type StagedScriptReviewListHandle,
} from "./staged-script-review-list"
import { StagingReviewToolbar } from "./staging-review-toolbar"

type BatchStagingPanelProps = {
	ingestion: BatchIngestionState
	committingBatch: boolean
	onCommitAll: () => Promise<void>
	onUpdateScriptName: (id: string, name: string) => Promise<void>
	onToggleExclude: (id: string, status: StagedScript["status"]) => Promise<void>
	onSplitScript: (scriptId: string, splitAfterIndex: number) => void
	onDeleteScript: () => void
	onAddScript: () => Promise<void>
}

export function BatchStagingPanel({
	ingestion,
	committingBatch,
	onCommitAll,
	onUpdateScriptName,
	onToggleExclude,
	onSplitScript,
	onDeleteScript,
	onAddScript,
}: BatchStagingPanelProps) {
	const scripts = ingestion.unsubmittedScripts

	if (scripts.length === 0) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-16 py-12 text-center">
					<p className="text-sm font-medium">
						All scripts submitted for marking
					</p>
					<p className="text-xs text-muted-foreground">
						Check the submissions tab for progress
					</p>
				</div>
			</div>
		)
	}

	return (
		<ScriptReviewLayout
			paperId={ingestion.paperId}
			scripts={scripts}
			urls={ingestion.urls}
			committingBatch={committingBatch}
			onCommitAll={onCommitAll}
			onUpdateScriptName={onUpdateScriptName}
			onToggleExclude={onToggleExclude}
			onSplitScript={onSplitScript}
			onDeleteScript={onDeleteScript}
			onAddScript={onAddScript}
			pagesPerScript={ingestion.pagesPerScript}
			classificationMode={ingestion.classificationMode}
		/>
	)
}

// ── Resizable two-panel review layout ────────────────────────────────────────

function ScriptReviewLayout({
	paperId,
	scripts,
	urls,
	committingBatch,
	onCommitAll,
	onUpdateScriptName,
	onToggleExclude,
	onDeleteScript,
	onAddScript,
}: {
	paperId: string
	scripts: StagedScript[]
	urls: Record<string, string>
	committingBatch: boolean
	onCommitAll: () => Promise<void>
	onUpdateScriptName: (id: string, name: string) => Promise<void>
	onToggleExclude: (id: string, status: StagedScript["status"]) => Promise<void>
	onSplitScript: (scriptId: string, splitAfterIndex: number) => void
	onDeleteScript: () => void
	onAddScript: () => Promise<void>
	pagesPerScript: number
	classificationMode: ClassificationMode
}) {
	const pendingScripts = scripts.filter((s) => s.status !== "confirmed")
	const confirmedScripts = scripts.filter((s) => s.status === "confirmed")

	return (
		<ResizablePanelGroup orientation="horizontal" className="h-full">
			{/* LEFT — scripts awaiting review */}
			<ResizablePanel defaultSize={58} minSize={30}>
				<ScriptReviewLeftPanel
					paperId={paperId}
					scripts={pendingScripts}
					urls={urls}
					onUpdateScriptName={onUpdateScriptName}
					onToggleExclude={onToggleExclude}
					onDeleteScript={onDeleteScript}
					onAddScript={onAddScript}
				/>
			</ResizablePanel>

			<ResizableHandle withHandle />

			{/* RIGHT — paper tray (confirmed scripts + commit button) */}
			<ResizablePanel defaultSize={42} minSize={25}>
				<div className="h-full overflow-y-auto px-6 py-6">
					<PaperTrayPanel
						urls={urls}
						confirmedScripts={confirmedScripts}
						committingBatch={committingBatch}
						onCommitAll={onCommitAll}
						onToggleExclude={onToggleExclude}
					/>
				</div>
			</ResizablePanel>
		</ResizablePanelGroup>
	)
}

// ── Left panel: toolbar (fixed) + scrollable script list ─────────────────────

function ScriptReviewLeftPanel({
	paperId,
	scripts,
	urls,
	onUpdateScriptName,
	onToggleExclude,
	onDeleteScript,
	onAddScript,
}: {
	paperId: string
	scripts: StagedScript[]
	urls: Record<string, string>
	onUpdateScriptName: (id: string, name: string) => Promise<void>
	onToggleExclude: (id: string, status: StagedScript["status"]) => Promise<void>
	onDeleteScript: () => void
	onAddScript: () => Promise<void>
}) {
	const listRef = useRef<StagedScriptReviewListHandle>(null)
	const [deletedPages, setDeletedPages] = useState<DeletedPage[]>([])
	const [addingScript, setAddingScript] = useState(false)

	function handlePageDeleted(page: DeletedPage) {
		setDeletedPages((prev) => [...prev, page])
	}

	function handleRestore(pageKey: string) {
		const page = deletedPages.find((p) => p.pageKey === pageKey)
		if (!page) return
		listRef.current?.restorePage(page)
		setDeletedPages((prev) => prev.filter((p) => p.pageKey !== pageKey))
	}

	async function handleAddScript() {
		setAddingScript(true)
		try {
			await onAddScript()
		} finally {
			setAddingScript(false)
		}
	}

	return (
		<div className="h-full flex flex-col min-h-0">
			{/* Toolbar — sits above the scroll area, always visible */}
			<StagingReviewToolbar
				deletedPages={deletedPages}
				onRestore={handleRestore}
				onAddScript={handleAddScript}
				addingScript={addingScript}
			/>

			{/* Scrollable content */}
			<div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
				{scripts.length === 0 ? (
					<div className="flex h-full items-center justify-center">
						<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-12 py-12 text-center">
							<p className="text-sm font-medium">All scripts confirmed</p>
							<p className="text-xs text-muted-foreground">
								Click &ldquo;Start marking&rdquo; on the right to begin
							</p>
						</div>
					</div>
				) : (
					<StagedScriptReviewList
						ref={listRef}
						paperId={paperId}
						urls={urls}
						scripts={scripts}
						onUpdateName={onUpdateScriptName}
						onToggleExclude={onToggleExclude}
						onDeleteScript={() => onDeleteScript()}
						onPageDeleted={handlePageDeleted}
					/>
				)}
			</div>
		</div>
	)
}

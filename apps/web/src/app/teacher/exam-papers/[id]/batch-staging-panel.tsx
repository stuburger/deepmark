"use client"

import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable"
import type { BatchIngestionState, StagedScript } from "@/lib/batch/types"
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
	onUpdateScriptName: (id: string, name: string) => Promise<void>
	onToggleExclude: (id: string, status: StagedScript["status"]) => Promise<void>
	onToggleIncludeAll: () => Promise<void>
	onSplitScript: (scriptId: string, splitAfterIndex: number) => void
	onDeleteScript: () => void
	onAddScript: () => Promise<void>
}

export function BatchStagingPanel({
	ingestion,
	onUpdateScriptName,
	onToggleExclude,
	onToggleIncludeAll,
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
			batchId={ingestion.batchId}
			paperId={ingestion.paperId}
			scripts={scripts}
			onUpdateScriptName={onUpdateScriptName}
			onToggleExclude={onToggleExclude}
			onToggleIncludeAll={onToggleIncludeAll}
			onSplitScript={onSplitScript}
			onDeleteScript={onDeleteScript}
			onAddScript={onAddScript}
		/>
	)
}

// ── Resizable two-panel review layout ────────────────────────────────────────

function ScriptReviewLayout({
	batchId,
	paperId,
	scripts,
	onUpdateScriptName,
	onToggleExclude,
	onToggleIncludeAll,
	onDeleteScript,
	onAddScript,
}: {
	batchId: string
	paperId: string
	scripts: StagedScript[]
	onUpdateScriptName: (id: string, name: string) => Promise<void>
	onToggleExclude: (id: string, status: StagedScript["status"]) => Promise<void>
	onToggleIncludeAll: () => Promise<void>
	onSplitScript: (scriptId: string, splitAfterIndex: number) => void
	onDeleteScript: () => void
	onAddScript: () => Promise<void>
}) {
	const confirmedScripts = scripts.filter((s) => s.status === "confirmed")

	return (
		<ResizablePanelGroup orientation="horizontal" className="h-full">
			{/* LEFT — all unsubmitted scripts (checked and unchecked) */}
			<ResizablePanel defaultSize={58} minSize={30}>
				<ScriptReviewLeftPanel
					batchId={batchId}
					paperId={paperId}
					scripts={scripts}
					onUpdateScriptName={onUpdateScriptName}
					onToggleExclude={onToggleExclude}
					onToggleIncludeAll={onToggleIncludeAll}
					onDeleteScript={onDeleteScript}
					onAddScript={onAddScript}
				/>
			</ResizablePanel>

			<ResizableHandle withHandle />

			{/* RIGHT — paper tray (confirmed scripts) */}
			<ResizablePanel defaultSize={42} minSize={25}>
				<PaperTrayPanel
					batchId={batchId}
					confirmedScripts={confirmedScripts}
					onToggleExclude={onToggleExclude}
				/>
			</ResizablePanel>
		</ResizablePanelGroup>
	)
}

// ── Left panel: toolbar (fixed) + scrollable script list ─────────────────────

function ScriptReviewLeftPanel({
	batchId,
	paperId,
	scripts,
	onUpdateScriptName,
	onToggleExclude,
	onToggleIncludeAll,
	onDeleteScript,
	onAddScript,
}: {
	batchId: string
	paperId: string
	scripts: StagedScript[]
	onUpdateScriptName: (id: string, name: string) => Promise<void>
	onToggleExclude: (id: string, status: StagedScript["status"]) => Promise<void>
	onToggleIncludeAll: () => Promise<void>
	onDeleteScript: () => void
	onAddScript: () => Promise<void>
}) {
	const listRef = useRef<StagedScriptReviewListHandle>(null)
	const [deletedPages, setDeletedPages] = useState<DeletedPage[]>([])
	const [addingScript, setAddingScript] = useState(false)
	const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({})

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

	function handleCollapsedChange(scriptId: string, collapsed: boolean) {
		setCollapsedMap((prev) => ({ ...prev, [scriptId]: collapsed }))
	}

	function setAllCollapsed(collapsed: boolean) {
		setCollapsedMap(Object.fromEntries(scripts.map((s) => [s.id, collapsed])))
	}

	const allConfirmed =
		scripts.length > 0 && scripts.every((s) => s.status === "confirmed")

	const allCollapsed =
		scripts.length > 0 &&
		scripts.every((s) => collapsedMap[s.id] ?? s.status === "confirmed")

	return (
		<div className="h-full flex flex-col min-h-0">
			{/* Toolbar — sits above the scroll area, always visible */}
			<StagingReviewToolbar
				deletedPages={deletedPages}
				onRestore={handleRestore}
				onAddScript={handleAddScript}
				addingScript={addingScript}
				allConfirmed={allConfirmed}
				onToggleIncludeAll={onToggleIncludeAll}
				canToggleIncludeAll={scripts.length > 0}
				allCollapsed={allCollapsed}
				canToggleCollapseAll={scripts.length > 0}
				onExpandAll={() => setAllCollapsed(false)}
				onCollapseAll={() => setAllCollapsed(true)}
			/>

			{/* Scrollable content */}
			<div className="flex-1 min-h-0 overflow-y-auto px-6 pt-4 pb-6 bg-muted/30">
				{scripts.length === 0 ? (
					<div className="flex h-full items-center justify-center">
						<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-12 py-12 text-center">
							<p className="text-sm font-medium">No scripts to review</p>
						</div>
					</div>
				) : (
					<StagedScriptReviewList
						ref={listRef}
						batchId={batchId}
						paperId={paperId}
						scripts={scripts}
						collapsedMap={collapsedMap}
						onCollapsedChange={handleCollapsedChange}
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

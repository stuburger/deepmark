"use client"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { MarkingJob, ScriptsWorkflowState, StagedScript } from "@/lib/batch/types"
import { deleteSubmission } from "@/lib/marking/mutations"
import { Eye, LayoutGrid, Rows3, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { PaperTrayPanel } from "./paper-tray-panel"
import { StagedScriptReviewCards } from "./staged-script-review-cards"
import { StagedScriptReviewList } from "./staged-script-review-list"
import { ViewToggle } from "./view-toggle"

type BatchStagingPanelProps = {
	workflow: ScriptsWorkflowState
	committingBatch: boolean
	viewMode: "list" | "grid"
	onViewModeChange: (v: "list" | "grid") => void
	onCommitAll: () => Promise<void>
	onUpdateScriptName: (id: string, name: string) => Promise<void>
	onToggleExclude: (id: string, status: string) => Promise<void>
	onSplitScript: (scriptId: string, splitAfterIndex: number) => void
	onDeleteScript: () => void
	onJobDeleted?: () => void
	onViewJob?: (id: string) => void
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
	workflow,
	committingBatch,
	viewMode,
	onViewModeChange,
	onCommitAll,
	onUpdateScriptName,
	onToggleExclude,
	onSplitScript,
	onDeleteScript,
	onJobDeleted,
	onViewJob,
}: BatchStagingPanelProps) {
	const scripts =
		workflow.isMarking ? workflow.unsubmittedScripts : workflow.allScripts

	if (workflow.isMarking) {
		return (
			<div className="space-y-6">
				<MarkingJobList
					jobs={workflow.markingJobs}
					onViewJob={onViewJob}
					onJobDeleted={onJobDeleted}
				/>

				{scripts.length > 0 && (
					<ScriptReviewLayout
						label="Review remaining scripts, then submit them for marking"
						scripts={scripts}
						urls={workflow.urls}
						viewMode={viewMode}
						onViewModeChange={onViewModeChange}
						committingBatch={committingBatch}
						onCommitAll={onCommitAll}
						onUpdateScriptName={onUpdateScriptName}
						onToggleExclude={onToggleExclude}
						onSplitScript={onSplitScript}
						onDeleteScript={onDeleteScript}
						pagesPerScript={workflow.pagesPerScript}
						classificationMode={workflow.classificationMode}
					/>
				)}
			</div>
		)
	}

	return (
		<ScriptReviewLayout
			label="Review each script, then include it in the marking run"
			scripts={scripts}
			urls={workflow.urls}
			viewMode={viewMode}
			onViewModeChange={onViewModeChange}
			committingBatch={committingBatch}
			onCommitAll={onCommitAll}
			onUpdateScriptName={onUpdateScriptName}
			onToggleExclude={onToggleExclude}
			onSplitScript={onSplitScript}
			onDeleteScript={onDeleteScript}
			pagesPerScript={workflow.pagesPerScript}
			classificationMode={workflow.classificationMode}
		/>
	)
}

// ── Shared two-column review layout ──────────────────────────────────────────

function ScriptReviewLayout({
	label,
	scripts,
	urls,
	viewMode,
	onViewModeChange,
	committingBatch,
	onCommitAll,
	onUpdateScriptName,
	onToggleExclude,
	onSplitScript,
	onDeleteScript,
	pagesPerScript,
	classificationMode,
}: {
	label: string
	scripts: StagedScript[]
	urls: Record<string, string>
	viewMode: "list" | "grid"
	onViewModeChange: (v: "list" | "grid") => void
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
				<ViewToggle
					value={viewMode}
					onChange={onViewModeChange}
					options={BACKLOG_VIEW_OPTIONS}
				/>
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
					) : viewMode === "list" ? (
						<StagedScriptReviewList
							urls={urls}
							scripts={pendingScripts}
							onUpdateName={onUpdateScriptName}
							onToggleExclude={onToggleExclude}
							onDeleteScript={() => onDeleteScript()}
						/>
					) : (
						<StagedScriptReviewCards
							urls={urls}
							scripts={pendingScripts}
							pagesPerScript={pagesPerScript}
							classificationMode={classificationMode}
							onUpdateName={onUpdateScriptName}
							onToggleExclude={onToggleExclude}
							onSplitScript={onSplitScript}
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

// ── MarkingJobList ─────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(["ocr_complete", "failed", "cancelled"])

function jobStatusLabel(status: string): string {
	switch (status) {
		case "pending":
			return "Queued"
		case "ocr_processing":
			return "OCR…"
		case "grading":
			return "Grading…"
		case "ocr_complete":
			return "Done"
		case "failed":
			return "Failed"
		case "cancelled":
			return "Cancelled"
		default:
			return status.replace(/_/g, " ")
	}
}

function jobStatusClass(status: string): string {
	if (status === "ocr_complete")
		return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
	if (status === "failed" || status === "cancelled")
		return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
	return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
}

function MarkingJobList({
	jobs,
	onViewJob,
	onJobDeleted,
}: {
	jobs: MarkingJob[]
	onViewJob?: (id: string) => void
	onJobDeleted?: () => void
}) {
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
	const [deleting, setDeleting] = useState(false)

	const pendingDeleteName =
		jobs.find((j) => j.id === pendingDeleteId)?.student_name ??
		"Unnamed student"

	async function handleConfirmDelete() {
		if (!pendingDeleteId) return
		setDeleting(true)
		const result = await deleteSubmission(pendingDeleteId)
		setDeleting(false)
		if (!result.ok) {
			toast.error(result.error)
			return
		}
		setPendingDeleteId(null)
		onJobDeleted?.()
	}

	if (jobs.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				No scripts submitted for marking yet.
			</p>
		)
	}

	return (
		<>
			<div className="space-y-1">
				{jobs.map((job) => {
					const isTerminal = TERMINAL_STATUSES.has(job.status)
					return (
						<div
							key={job.id}
							className="flex items-center gap-3 rounded-lg border px-3 py-2.5 group"
						>
							<div className="flex-1 min-w-0">
								<p className="text-sm truncate">
									{job.student_name ?? (
										<span className="text-muted-foreground italic">
											Unnamed student
										</span>
									)}
								</p>
							</div>
							<span
								className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums shrink-0 ${jobStatusClass(job.status)}`}
							>
								{jobStatusLabel(job.status)}
							</span>
							<div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
								{isTerminal && onViewJob && (
									<Button
										size="sm"
										variant="ghost"
										className="h-7 px-2 text-xs text-muted-foreground"
										onClick={() => onViewJob(job.id)}
									>
										<Eye className="h-3.5 w-3.5 mr-1" />
										View
									</Button>
								)}
								<Button
									size="sm"
									variant="ghost"
									className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
									title="Delete this submission"
									onClick={() => setPendingDeleteId(job.id)}
								>
									<Trash2 className="h-3.5 w-3.5" />
									<span className="sr-only">Delete</span>
								</Button>
							</div>
						</div>
					)
				})}
			</div>

			<ConfirmDialog
				open={pendingDeleteId !== null}
				onOpenChange={(open) => {
					if (!deleting && !open) setPendingDeleteId(null)
				}}
				title="Delete this submission?"
				description={`This will permanently delete ${pendingDeleteName}'s submission and all its marking data. This cannot be undone.`}
				confirmLabel={deleting ? "Deleting…" : "Delete submission"}
				loading={deleting}
				onConfirm={handleConfirmDelete}
			/>
		</>
	)
}

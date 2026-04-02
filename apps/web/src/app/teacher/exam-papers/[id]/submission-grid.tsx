"use client"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import type { ActiveBatchInfo } from "@/lib/batch/types"
import { deleteStudentPaperJob } from "@/lib/marking/mutations"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { ScriptCard } from "./script-card"
import { StagedScriptReviewCards } from "./staged-script-review-cards"

export function SubmissionGrid({
	submissions,
	onView,
	onDelete,
	activeBatch,
	committingBatch = false,
	onCommitAll,
	onUpdateScriptName,
	onToggleExclude,
	onDeleteScript,
}: {
	submissions: SubmissionHistoryItem[]
	onView: (id: string) => void
	onDelete: (id: string) => void
	activeBatch?: ActiveBatchInfo
	committingBatch?: boolean
	onCommitAll?: () => Promise<void>
	onUpdateScriptName?: (id: string, name: string) => Promise<void>
	onToggleExclude?: (id: string, status: string) => Promise<void>
	onDeleteScript?: () => void
}) {
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
	const [deleting, setDeleting] = useState(false)

	async function handleConfirmDelete() {
		if (!pendingDeleteId) return
		setDeleting(true)
		const result = await deleteStudentPaperJob(pendingDeleteId)
		setDeleting(false)
		if (!result.ok) {
			toast.error(result.error)
			return
		}
		onDelete(pendingDeleteId)
		setPendingDeleteId(null)
	}

	const pendingDeleteName =
		submissions.find((s) => s.id === pendingDeleteId)?.student_name ??
		"Unnamed student"

	return (
		<div className="space-y-4">
			{/* Active batch status — classifying */}
			{activeBatch?.status === "classifying" && (
				<div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-4">
					<Loader2 className="h-5 w-5 animate-spin text-muted-foreground shrink-0" />
					<p className="text-sm text-muted-foreground">
						Analysing upload… scripts will appear here shortly.
					</p>
				</div>
			)}

			{/* Active batch status — staging review */}
			{activeBatch?.status === "staging" && (
				<div className="space-y-4">
					<div className="flex items-center justify-between gap-3">
						<p className="text-sm font-medium">
							Review detected scripts before marking
						</p>
						{activeBatch.staged_scripts.filter((s) => s.status !== "excluded")
							.length > 0 && (
							<Button
								size="sm"
								disabled={committingBatch}
								onClick={() => onCommitAll?.()}
							>
								{committingBatch ? (
									<>
										<Spinner className="h-3.5 w-3.5 mr-1.5" />
										Starting…
									</>
								) : (
									`Start marking ${
										activeBatch.staged_scripts.filter(
											(s) => s.status !== "excluded",
										).length
									} scripts`
								)}
							</Button>
						)}
					</div>
					<StagedScriptReviewCards
						batchId={activeBatch.id}
						scripts={activeBatch.staged_scripts}
						onUpdateName={async (id, name) => {
							await onUpdateScriptName?.(id, name)
						}}
						onToggleExclude={async (id, status) => {
							await onToggleExclude?.(id, status)
						}}
						onDeleteScript={() => onDeleteScript?.()}
					/>
				</div>
			)}

			{/* Active batch status — marking progress */}
			{activeBatch?.status === "marking" && (
				<div className="rounded-lg border bg-muted/20 px-4 py-4 space-y-2">
					<div className="flex items-center justify-between text-sm">
						<span className="font-medium">
							{
								activeBatch.student_jobs.filter(
									(j) => j.status === "ocr_complete",
								).length
							}{" "}
							of {activeBatch.total_student_jobs} scripts marked
						</span>
						<span className="text-muted-foreground">
							{activeBatch.total_student_jobs > 0
								? Math.round(
										(activeBatch.student_jobs.filter(
											(j) => j.status === "ocr_complete",
										).length /
											activeBatch.total_student_jobs) *
											100,
									)
								: 0}
							%
						</span>
					</div>
					<Progress
						value={
							activeBatch.total_student_jobs > 0
								? (activeBatch.student_jobs.filter(
										(j) => j.status === "ocr_complete",
									).length /
										activeBatch.total_student_jobs) *
									100
								: 0
						}
					/>
				</div>
			)}

			{/* Card grid */}
			<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
				{submissions.map((sub) => (
					<ScriptCard
						key={sub.id}
						sub={sub}
						onView={() => onView(sub.id)}
						onDeleteRequest={() => setPendingDeleteId(sub.id)}
					/>
				))}
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
		</div>
	)
}

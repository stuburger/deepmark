"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ActiveBatchInfo } from "@/lib/batch/mutations"
import { deleteStudentPaperJob } from "@/lib/marking/mutations"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { Loader2, Trash2 } from "lucide-react"
import { parseAsStringEnum, useQueryState } from "nuqs"
import { useState } from "react"
import { toast } from "sonner"
import { ScriptCard } from "./script-card"
import { StagedScriptReviewCards } from "./staged-script-review-cards"
import {
	TERMINAL_STATUSES,
	formatDate,
	scoreColour,
	statusLabel,
} from "./submission-grid-config"
import { ViewToggle } from "./view-toggle"

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
	const [subView, setSubView] = useQueryState(
		"submissions_view",
		parseAsStringEnum(["grid", "table"]).withDefault("grid"),
	)
	const [subTab, setSubTab] = useQueryState(
		"submissions_tab",
		parseAsStringEnum(["complete", "backlog"]).withDefault("complete"),
	)
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
	const [deleting, setDeleting] = useState(false)

	const complete = submissions.filter((s) => TERMINAL_STATUSES.has(s.status))
	const backlog = submissions.filter((s) => !TERMINAL_STATUSES.has(s.status))
	const visible = subTab === "complete" ? complete : backlog

	// Backlog badge count: staged scripts (staging phase) or in-flight jobs (otherwise)
	const backlogBadgeCount =
		activeBatch?.status === "staging"
			? activeBatch.staged_scripts.filter((s) => s.status !== "excluded").length
			: backlog.length

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
			<Tabs
				value={subTab}
				onValueChange={(v) => setSubTab(v as "complete" | "backlog")}
			>
				<TabsList>
					<TabsTrigger value="complete">
						Complete
						<span className="ml-1.5 rounded-full bg-background/60 px-1.5 py-0.5 text-xs tabular-nums">
							{complete.length}
						</span>
					</TabsTrigger>
					<TabsTrigger value="backlog">
						Backlog
						<span className="ml-1.5 rounded-full bg-background/60 px-1.5 py-0.5 text-xs tabular-nums">
							{backlogBadgeCount}
						</span>
					</TabsTrigger>
				</TabsList>
			</Tabs>

			{/* Header row: count + view toggle */}
			<div className="flex items-center justify-between gap-4">
				<p className="text-sm text-muted-foreground">
					{visible.length === 0
						? "No submissions yet."
						: `${visible.length} submission${visible.length !== 1 ? "s" : ""}`}
				</p>
				{visible.length > 0 && (
					<ViewToggle value={subView} onChange={setSubView} />
				)}
			</div>

			{/* Active batch status — shown in Backlog tab only */}
			{subTab === "backlog" && activeBatch?.status === "classifying" && (
				<div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-4">
					<Loader2 className="h-5 w-5 animate-spin text-muted-foreground shrink-0" />
					<p className="text-sm text-muted-foreground">
						Analysing upload… scripts will appear here shortly.
					</p>
				</div>
			)}

			{subTab === "backlog" && activeBatch?.status === "staging" && (
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

			{subTab === "backlog" && activeBatch?.status === "marking" && (
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

			{subView === "grid" ? (
				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
					{visible.map((sub) => (
						<ScriptCard
							key={sub.id}
							sub={sub}
							onView={() => onView(sub.id)}
							onDeleteRequest={() => setPendingDeleteId(sub.id)}
						/>
					))}
				</div>
			) : (
				<Card>
					<CardContent className="pt-4">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Student</TableHead>
									<TableHead>Score</TableHead>
									<TableHead>Date</TableHead>
									<TableHead className="w-20" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{visible.map((sub) => {
									const pct =
										sub.total_max > 0
											? Math.round((sub.total_awarded / sub.total_max) * 100)
											: null
									const colours = scoreColour(pct)
									return (
										<TableRow key={sub.id} className="group">
											<TableCell className="text-sm">
												{sub.student_name ?? (
													<span className="text-muted-foreground italic">
														Unnamed
													</span>
												)}
											</TableCell>
											<TableCell>
												{pct !== null ? (
													<span
														className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${colours?.chip}`}
													>
														{sub.total_awarded}/{sub.total_max} · {pct}%
													</span>
												) : (
													<span className="text-xs text-muted-foreground capitalize">
														{statusLabel(sub.status)}
													</span>
												)}
											</TableCell>
											<TableCell className="text-xs text-muted-foreground tabular-nums">
												{formatDate(sub.created_at)}
											</TableCell>
											<TableCell>
												<div className="flex items-center justify-end gap-2">
													<button
														type="button"
														onClick={() => onView(sub.id)}
														className="text-xs text-muted-foreground hover:text-foreground transition-colors"
													>
														View
													</button>
													<Button
														size="sm"
														variant="ghost"
														className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
														title="Delete submission"
														onClick={() => setPendingDeleteId(sub.id)}
													>
														<Trash2 className="h-3.5 w-3.5" />
														<span className="sr-only">Delete submission</span>
													</Button>
												</div>
											</TableCell>
										</TableRow>
									)
								})}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}

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

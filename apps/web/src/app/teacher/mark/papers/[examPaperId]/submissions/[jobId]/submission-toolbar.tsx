"use client"

import { CollaboratorAvatars } from "@/components/annotated-answer/collaborator-avatars"
import { useCollaborators } from "@/components/annotated-answer/use-collaborators"
import { useDocScoreTotals } from "@/components/annotated-answer/use-doc-score-totals"
import { useYDoc } from "@/components/annotated-answer/use-y-doc"
import { ShareDialog } from "@/components/sharing/share-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type { MarkingPhase } from "@/lib/marking/stages/phase"
import {
	type BatchAdjacency,
	useAdjacentSubmissions,
} from "@/lib/marking/submissions/hooks"
import {
	confirmMarking,
	toggleBookmark,
} from "@/lib/marking/submissions/mutations"
import type {
	PageToken,
	StudentPaperAnnotation,
	StudentPaperJobPayload,
} from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useCurrentUser } from "@/lib/users/use-current-user"
import { cn } from "@/lib/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
	Bookmark,
	ChevronLeft,
	ChevronRight,
	Eye,
	Share2,
	X,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { ReScanButton } from "./re-scan-button"
import { DownloadPdfButton } from "./results/download-pdf-button"
import { LlmSpendButton } from "./results/llm-snapshot-panel"
import { ReRunMenu } from "./results/re-run-menu"
import { StudentNameEditor } from "./results/student-name-editor"
import { SubmissionFeedbackButton } from "./results/submission-feedback"
import { StatusBadge } from "./status-badge"
import { VersionSwitcher } from "./version-switcher"

// ─── Main toolbar ─────────────────────────────────────────────────────────────

export function SubmissionToolbar({
	examPaperId,
	jobId,
	data,
	phase,
	onNavigateToJob,
	onClose,
	annotations,
	pageTokens,
	paperAccessible = true,
	readOnly = false,
}: {
	examPaperId: string
	jobId: string
	data: StudentPaperJobPayload
	phase: MarkingPhase
	onNavigateToJob: (newJobId: string) => void
	onClose?: () => void
	annotations?: StudentPaperAnnotation[]
	pageTokens?: PageToken[]
	paperAccessible?: boolean
	readOnly?: boolean
}) {
	// Same docKey as grading-results-panel — useYDoc's module-scope cache
	// reference-counts, so this doesn't open a second WebSocket. The provider
	// is null while indexeddb-only mode is active or before the cache entry
	// initialises; useCollaborators tolerates that and returns [].
	const docKey = data.submission_id ?? jobId
	const { doc, provider } = useYDoc(docKey)
	const collaborators = useCollaborators(provider)
	const { isAdmin, cursorUser } = useCurrentUser()
	const queryClient = useQueryClient()

	const { data: adjacent } = useAdjacentSubmissions(examPaperId, jobId)
	const prevId = adjacent?.prevId ?? null
	const nextId = adjacent?.nextId ?? null
	const isConfirmed = data.confirmed_at !== null

	// Prefix-only key for the batch-progress cache: matches every cached
	// (examPaperId, *) entry, so confirming bumps the count for ALL cached
	// submissions in the batch — not just the one being confirmed.
	const batchAdjacencyPrefix = ["adjacentSubmissions", examPaperId] as const

	const confirmMutation = useMutation({
		mutationFn: async (confirmed: boolean) => {
			const r = await confirmMarking({ jobId, confirmed })
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data
		},
		onMutate: async (confirmed) => {
			await queryClient.cancelQueries({
				queryKey: queryKeys.studentJob(jobId),
			})
			await queryClient.cancelQueries({ queryKey: batchAdjacencyPrefix })
			const previous = queryClient.getQueryData<StudentPaperJobPayload | null>(
				queryKeys.studentJob(jobId),
			)
			if (previous) {
				queryClient.setQueryData<StudentPaperJobPayload | null>(
					queryKeys.studentJob(jobId),
					{ ...previous, confirmed_at: confirmed ? new Date() : null },
				)
			}
			// Optimistically nudge confirmedCount in the right direction across
			// every cached batch progress entry for this paper so the
			// top-of-modal flare animates instantly.
			const delta = confirmed ? 1 : -1
			queryClient.setQueriesData<BatchAdjacency>(
				{ queryKey: batchAdjacencyPrefix },
				(old) =>
					old
						? {
								...old,
								confirmedCount: Math.max(0, old.confirmedCount + delta),
							}
						: old,
			)
			return { previous, delta }
		},
		onError: (err, confirmed, context) => {
			if (context?.previous !== undefined) {
				queryClient.setQueryData(queryKeys.studentJob(jobId), context.previous)
			}
			// Roll back the optimistic count nudge in the opposite direction.
			const delta = context?.delta ?? (confirmed ? 1 : -1)
			queryClient.setQueriesData<BatchAdjacency>(
				{ queryKey: batchAdjacencyPrefix },
				(old) =>
					old
						? {
								...old,
								confirmedCount: Math.max(0, old.confirmedCount - delta),
							}
						: old,
			)
			toast.error(
				err instanceof Error
					? err.message
					: confirmed
						? "Failed to confirm marking"
						: "Failed to unconfirm marking",
			)
		},
		onSuccess: (_data, confirmed) => {
			toast.success(confirmed ? "Marking confirmed" : "Marking unconfirmed")
		},
		onSettled: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.submissions(examPaperId),
			})
			queryClient.invalidateQueries({
				queryKey: queryKeys.studentJob(jobId),
			})
			// Invalidate every cached (examPaperId, *) entry so any submission
			// the user navigates to next refetches the live count.
			queryClient.invalidateQueries({ queryKey: batchAdjacencyPrefix })
		},
	})

	const bookmarkMutation = useMutation({
		mutationFn: async (next: boolean) => {
			const r = await toggleBookmark({ jobId, bookmarked: next })
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data
		},
		onMutate: async (next) => {
			await queryClient.cancelQueries({
				queryKey: queryKeys.studentJob(jobId),
			})
			const previous = queryClient.getQueryData<StudentPaperJobPayload | null>(
				queryKeys.studentJob(jobId),
			)
			if (previous) {
				queryClient.setQueryData<StudentPaperJobPayload | null>(
					queryKeys.studentJob(jobId),
					{ ...previous, is_bookmarked: next },
				)
			}
			return { previous }
		},
		onError: (err, _next, context) => {
			if (context?.previous !== undefined) {
				queryClient.setQueryData(queryKeys.studentJob(jobId), context.previous)
			}
			toast.error(
				err instanceof Error ? err.message : "Failed to update bookmark",
			)
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks() })
			queryClient.invalidateQueries({
				queryKey: queryKeys.submissions(examPaperId),
			})
			queryClient.invalidateQueries({
				queryKey: queryKeys.studentJob(jobId),
			})
		},
	})

	// Live totals from the Y.Doc — overrides the server payload so teacher
	// edits in the editor reflect immediately. Falls back to `data.*` until
	// the doc has hydrated with at least one max score.
	const liveTotals = useDocScoreTotals(doc)
	const totalAwarded = liveTotals.hasData
		? liveTotals.awarded
		: data.total_awarded
	const totalMax = liveTotals.hasData ? liveTotals.max : data.total_max

	return (
		<TooltipProvider>
			{/* ── Row 1: Context / breadcrumb ─────────────────────────────────── */}
			<div className="shrink-0 flex items-center gap-1.5 sm:gap-2 border-b border-border-quiet bg-background px-2 sm:px-4 min-h-9 py-1 text-sm">
				{!onClose && (
					<div className="hidden md:flex items-center gap-2 shrink-0">
						<Link
							href={paperAccessible ? "/teacher/exam-papers" : "/teacher/mark"}
							className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
						>
							{paperAccessible ? "Papers" : "Marking"}
						</Link>

						{data.exam_paper_title && (
							<>
								<ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
								{paperAccessible ? (
									<Link
										href={`/teacher/exam-papers/${examPaperId}`}
										className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-48"
										title={data.exam_paper_title}
									>
										{data.exam_paper_title}
									</Link>
								) : (
									<span
										className="text-muted-foreground truncate max-w-48"
										title={data.exam_paper_title}
									>
										{data.exam_paper_title}
									</span>
								)}
							</>
						)}

						<ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
					</div>
				)}

				<StudentNameEditor jobId={jobId} initialName={data.student_name} />
				<VersionSwitcher jobId={jobId} onVersionChange={onNavigateToJob} />

				<div className="ml-auto flex items-center gap-1.5 sm:gap-3">
					<div className="flex items-center gap-1">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => prevId && onNavigateToJob(prevId)}
							disabled={!prevId}
							aria-label="Previous submission"
							className="gap-1 px-2 sm:px-3"
						>
							<ChevronLeft className="h-3.5 w-3.5" />
							<span className="hidden sm:inline">Prev</span>
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => nextId && onNavigateToJob(nextId)}
							disabled={!nextId}
							aria-label="Next submission"
							className="gap-1 px-2 sm:px-3"
						>
							<span className="hidden sm:inline">Next</span>
							<ChevronRight className="h-3.5 w-3.5" />
						</Button>
					</div>
					{data.submission_id && !readOnly && (
						<ShareDialog
							resourceType="student_submission"
							resourceId={data.submission_id}
							trigger={
								<Button
									variant="ghost"
									size="sm"
									className="hidden md:inline-flex h-7 gap-1.5"
								>
									<Share2 className="h-3.5 w-3.5" />
									Share
								</Button>
							}
						/>
					)}
					<CollaboratorAvatars users={collaborators} self={cursorUser} />
					{onClose && (
						<Tooltip>
							<TooltipTrigger
								render={
									<button
										type="button"
										onClick={onClose}
										className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
										aria-label="Close"
									>
										<X className="h-4 w-4" />
									</button>
								}
							/>
							<TooltipContent side="bottom" sideOffset={6}>
								Close
							</TooltipContent>
						</Tooltip>
					)}
				</div>
			</div>

			{/* ── Row 2: Submission state ────────────────────────────────────────
			    Left cluster: state of THIS submission (read-only? bookmarked?
			    what stage? final score/grade?). Right cluster: completed-phase
			    output actions on the result. */}
			<div className="shrink-0 flex items-center gap-1.5 sm:gap-2 border-b border-border-quiet bg-background px-2 sm:px-4 min-h-11 py-1">
				{readOnly && (
					<Tooltip>
						<TooltipTrigger
							render={
								<Badge variant="outline" className="gap-1">
									<Eye className="h-3 w-3" />
									Read only
								</Badge>
							}
						/>
						<TooltipContent side="bottom" sideOffset={6}>
							You have viewer access — edits are disabled
						</TooltipContent>
					</Tooltip>
				)}
				{!readOnly && (
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									type="button"
									variant="ghost"
									size="sm"
									aria-pressed={data.is_bookmarked}
									aria-label={
										data.is_bookmarked
											? "Remove bookmark"
											: "Bookmark this submission"
									}
									onClick={() => bookmarkMutation.mutate(!data.is_bookmarked)}
									className={cn(
										"h-7 px-2 border",
										data.is_bookmarked
											? "border-primary bg-primary/5 text-primary hover:bg-primary/10"
											: "border-border bg-card text-muted-foreground hover:text-foreground",
									)}
								>
									<Bookmark
										className="h-3.5 w-3.5"
										fill={data.is_bookmarked ? "currentColor" : "none"}
									/>
								</Button>
							}
						/>
						<TooltipContent side="bottom" sideOffset={6}>
							{data.is_bookmarked ? "Bookmarked" : "Bookmark"}
						</TooltipContent>
					</Tooltip>
				)}

				{/* State-aware status: extracting / grading / ready-to-confirm /
				    confirmed / failed / cancelled. Subsumes StagePips,
				    standalone Confirm button, and Score/Grade badges. */}
				<StatusBadge
					jobId={jobId}
					isConfirmed={isConfirmed}
					onConfirm={() => confirmMutation.mutate(!isConfirmed)}
					isPending={confirmMutation.isPending}
					totalAwarded={totalAwarded}
					totalMax={totalMax}
					gradeBoundaries={data.grade_boundaries}
					gradeBoundaryMode={data.grade_boundary_mode}
					readOnly={readOnly}
				/>

				<div className="ml-auto flex items-center gap-2">
					{/* LLM spend — admin-only (exposes model + per-call costs) */}
					{isAdmin && (
						<LlmSpendButton
							ocrSnapshot={data.ocr_llm_snapshot}
							gradingSnapshot={data.grading_llm_snapshot}
							annotationSnapshot={data.annotation_llm_snapshot}
						/>
					)}

					{/* Completed-phase output actions */}
					{phase === "completed" && (
						<>
							{data.submission_id && (
								<SubmissionFeedbackButton submissionId={data.submission_id} />
							)}
							<DownloadPdfButton
								data={data}
								annotations={annotations}
								pageTokens={pageTokens}
							/>
							<ReRunMenu jobId={jobId} onNavigateToJob={onNavigateToJob} />
						</>
					)}

					{/* Scan recovery */}
					{data.pages_count > 0 &&
						(phase === "scan_processing" || phase === "failed") && (
							<ReScanButton jobId={jobId} onNavigateToJob={onNavigateToJob} />
						)}
				</div>
			</div>
		</TooltipProvider>
	)
}

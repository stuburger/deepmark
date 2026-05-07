"use client"

import { CollaboratorAvatars } from "@/components/annotated-answer/collaborator-avatars"
import { useCollaborators } from "@/components/annotated-answer/use-collaborators"
import { useDocScoreTotals } from "@/components/annotated-answer/use-doc-score-totals"
import { useYDoc } from "@/components/annotated-answer/use-y-doc"
import { ShareDialog } from "@/components/sharing/share-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SoftChip } from "@/components/ui/soft-chip"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type { MarkingPhase } from "@/lib/marking/stages/phase"
import {
	confirmMarking,
	toggleBookmark,
} from "@/lib/marking/submissions/mutations"
import { getAdjacentSubmissions } from "@/lib/marking/submissions/queries"
import type {
	PageToken,
	StudentPaperAnnotation,
	StudentPaperJobPayload,
} from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useCurrentUser } from "@/lib/users/use-current-user"
import { cn } from "@/lib/utils"
import { computeGrade } from "@mcp-gcse/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	Bookmark,
	Check,
	ChevronLeft,
	ChevronRight,
	Eye,
	Loader2,
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
import { StagePips } from "./stage-pips"
import { GradeBadge, ScoreBadge } from "./submission-toolbar-controls"
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

	const { data: adjacent } = useQuery({
		queryKey: queryKeys.adjacentSubmissions(examPaperId, jobId),
		queryFn: async () => {
			const r = await getAdjacentSubmissions({ examPaperId, jobId })
			return r?.data ?? { prevId: null, nextId: null }
		},
		staleTime: 30_000,
	})
	const prevId = adjacent?.prevId ?? null
	const nextId = adjacent?.nextId ?? null
	const isConfirmed = data.confirmed_at !== null

	const confirmMutation = useMutation({
		mutationFn: async () => {
			const r = await confirmMarking({ jobId })
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data
		},
		onMutate: async () => {
			await queryClient.cancelQueries({
				queryKey: queryKeys.studentJob(jobId),
			})
			const previous = queryClient.getQueryData<StudentPaperJobPayload | null>(
				queryKeys.studentJob(jobId),
			)
			if (previous) {
				queryClient.setQueryData<StudentPaperJobPayload | null>(
					queryKeys.studentJob(jobId),
					{ ...previous, confirmed_at: new Date() },
				)
			}
			return { previous }
		},
		onError: (err, _vars, context) => {
			if (context?.previous !== undefined) {
				queryClient.setQueryData(queryKeys.studentJob(jobId), context.previous)
			}
			toast.error(
				err instanceof Error ? err.message : "Failed to confirm marking",
			)
		},
		onSuccess: () => {
			toast.success("Marking confirmed")
			if (nextId) onNavigateToJob(nextId)
			else onClose?.()
		},
		onSettled: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.submissions(examPaperId),
			})
			queryClient.invalidateQueries({
				queryKey: queryKeys.studentJob(jobId),
			})
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
			<div className="shrink-0 flex items-center gap-2 border-b border-border-quiet bg-background px-4 h-9 text-sm">
				{!onClose && (
					<>
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
					</>
				)}

				<StudentNameEditor jobId={jobId} initialName={data.student_name} />
				<VersionSwitcher jobId={jobId} onVersionChange={onNavigateToJob} />

				{phase === "completed" && totalMax > 0 && (
					<span className="ml-2 inline-flex items-center gap-1.5">
						<ScoreBadge awarded={totalAwarded} max={totalMax} />
						{(() => {
							const grade = computeGrade(
								totalAwarded,
								totalMax,
								data.grade_boundaries,
								data.grade_boundary_mode ?? "percent",
							)
							return grade ? <GradeBadge grade={grade} /> : null
						})()}
					</span>
				)}

				<div className="ml-auto flex items-center gap-3">
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
					<div className="flex items-center gap-1">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => prevId && onNavigateToJob(prevId)}
							disabled={!prevId}
							className="gap-1"
						>
							<ChevronLeft className="h-3.5 w-3.5" />
							Prev
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => nextId && onNavigateToJob(nextId)}
							disabled={!nextId}
							className="gap-1"
						>
							Next
							<ChevronRight className="h-3.5 w-3.5" />
						</Button>
					</div>
					<CollaboratorAvatars users={collaborators} self={cursorUser} />
					{data.submission_id && !readOnly && (
						<ShareDialog
							resourceType="student_submission"
							resourceId={data.submission_id}
							trigger={
								<Button variant="ghost" size="sm" className="h-7 gap-1.5">
									<Share2 className="h-3.5 w-3.5" />
									Share
								</Button>
							}
						/>
					)}
					{!readOnly && (
						<>
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
											onClick={() =>
												bookmarkMutation.mutate(!data.is_bookmarked)
											}
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
							{isConfirmed ? (
								<SoftChip kind="success" className="gap-1">
									<Check className="h-3 w-3" />
									Confirmed
								</SoftChip>
							) : (
								<Button
									type="button"
									variant="confirm"
									onClick={() => confirmMutation.mutate()}
									disabled={confirmMutation.isPending}
								>
									{confirmMutation.isPending ? (
										<Loader2 className="h-3.5 w-3.5 animate-spin" />
									) : (
										<Check className="h-3.5 w-3.5" />
									)}
									Confirm marking
								</Button>
							)}
						</>
					)}
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

			{/* ── Row 2: Job-level controls ────────────────────────────────────── */}
			<div className="shrink-0 flex items-center gap-2 border-b border-border-quiet bg-background px-4 h-11">
				<div className="flex-1" />

				{/* LLM spend — admin-only (exposes model + per-call costs) */}
				{isAdmin && (
					<LlmSpendButton
						ocrSnapshot={data.ocr_llm_snapshot}
						gradingSnapshot={data.grading_llm_snapshot}
						annotationSnapshot={data.annotation_llm_snapshot}
					/>
				)}

				{/* Pipeline stage pips */}
				<StagePips jobId={jobId} onNavigateToJob={onNavigateToJob} />

				{/* Completed-phase output actions */}
				{phase === "completed" && (
					<div className="flex items-center gap-2">
						{data.submission_id && (
							<SubmissionFeedbackButton submissionId={data.submission_id} />
						)}
						<DownloadPdfButton
							data={data}
							annotations={annotations}
							pageTokens={pageTokens}
						/>
						<ReRunMenu jobId={jobId} onNavigateToJob={onNavigateToJob} />
					</div>
				)}

				{/* Scan recovery */}
				{data.pages_count > 0 &&
					(phase === "scan_processing" || phase === "failed") && (
						<ReScanButton jobId={jobId} onNavigateToJob={onNavigateToJob} />
					)}
			</div>
		</TooltipProvider>
	)
}

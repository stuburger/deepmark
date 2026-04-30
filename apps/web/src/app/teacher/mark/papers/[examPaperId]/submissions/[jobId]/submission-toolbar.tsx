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
import type {
	PageToken,
	StudentPaperAnnotation,
	StudentPaperJobPayload,
} from "@/lib/marking/types"
import { computeGrade } from "@mcp-gcse/shared"
import { ChevronRight, Eye, Share2, X } from "lucide-react"
import Link from "next/link"
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
	onVersionChange,
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
	onNavigateToJob?: (newJobId: string) => void
	onVersionChange?: (newJobId: string) => void
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
			<div className="shrink-0 flex items-center gap-1.5 border-b bg-muted/40 px-4 h-9 text-sm">
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
				{onVersionChange && (
					<VersionSwitcher jobId={jobId} onVersionChange={onVersionChange} />
				)}

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
					<CollaboratorAvatars users={collaborators} />
					{data.submission_id && !readOnly && (
						<ShareDialog
							submissionIds={[data.submission_id]}
							trigger={
								<Button variant="ghost" size="sm" className="h-7 gap-1.5">
									<Share2 className="h-3.5 w-3.5" />
									Share
								</Button>
							}
						/>
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
			<div className="shrink-0 flex items-center gap-2 border-b bg-background px-4 h-11">
				<div className="flex-1" />

				{/* LLM spend */}
				<LlmSpendButton
					ocrSnapshot={data.ocr_llm_snapshot}
					gradingSnapshot={data.grading_llm_snapshot}
					annotationSnapshot={data.annotation_llm_snapshot}
				/>

				{/* Pipeline stage pips */}
				<StagePips
					jobId={jobId}
					onNavigateToJob={onNavigateToJob ?? (() => {})}
				/>

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
						<ReRunMenu
							jobId={jobId}
							onNavigateToJob={onNavigateToJob ?? (() => {})}
						/>
					</div>
				)}

				{/* Scan recovery */}
				{data.pages_count > 0 &&
					(phase === "scan_processing" || phase === "failed") && (
						<ReScanButton
							jobId={jobId}
							onNavigateToJob={onNavigateToJob ?? (() => {})}
						/>
					)}
			</div>
		</TooltipProvider>
	)
}

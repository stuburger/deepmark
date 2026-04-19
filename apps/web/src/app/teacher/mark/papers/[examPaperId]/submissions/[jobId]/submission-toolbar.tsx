"use client"

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
import { ChevronRight, X } from "lucide-react"
import Link from "next/link"
import { ReScanButton } from "./re-scan-button"
import { DownloadPdfButton } from "./results/download-pdf-button"
import { LlmSpendButton } from "./results/llm-snapshot-panel"
import { ReRunMenu } from "./results/re-run-menu"
import { StudentNameEditor } from "./results/student-name-editor"
import { SubmissionFeedbackButton } from "./results/submission-feedback"
import { StagePips } from "./stage-pips"
import { ScoreBadge } from "./submission-toolbar-controls"
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
}) {
	return (
		<TooltipProvider>
			{/* ── Row 1: Context / breadcrumb ─────────────────────────────────── */}
			<div className="shrink-0 flex items-center gap-1.5 border-b bg-muted/40 px-4 h-9 text-sm">
				{!onClose && (
					<>
						<Link
							href="/teacher/exam-papers"
							className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
						>
							Papers
						</Link>

						{data.exam_paper_title && (
							<>
								<ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
								<Link
									href={`/teacher/exam-papers/${examPaperId}`}
									className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-48"
									title={data.exam_paper_title}
								>
									{data.exam_paper_title}
								</Link>
							</>
						)}

						<ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
					</>
				)}

				<StudentNameEditor jobId={jobId} initialName={data.student_name} />
				{onVersionChange && (
					<VersionSwitcher jobId={jobId} onVersionChange={onVersionChange} />
				)}

				{phase === "completed" && data.total_max > 0 && (
					<span className="ml-2">
						<ScoreBadge awarded={data.total_awarded} max={data.total_max} />
					</span>
				)}

				{onClose && (
					<>
						<div className="flex-1" />
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
					</>
				)}
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

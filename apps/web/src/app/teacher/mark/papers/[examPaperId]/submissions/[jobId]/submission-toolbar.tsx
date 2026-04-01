"use client"

import { buttonVariants } from "@/components/ui/button-variants"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ScanPageUrl, StudentPaperJobPayload } from "@/lib/marking/types"
import { cn } from "@/lib/utils"
import {
	ChevronRight,
	FileText,
	MapPin,
	PlusCircle,
	ScanText,
	StickyNote,
} from "lucide-react"
import Link from "next/link"
import { DownloadPdfButton } from "../../../../[jobId]/phases/results/download-pdf-button"
import { ReMarkButton } from "../../../../[jobId]/phases/results/re-mark-button"
import { StudentNameEditor } from "../../../../[jobId]/phases/results/student-name-editor"
import type { MarkingPhase } from "../../../../[jobId]/shared/phase"
import { ReScanButton } from "../../../../[jobId]/shared/re-scan-button"
import { ObservationsSheet, TranscriptSheet } from "./ocr-sheets"
import { GroupToggle, ScoreBadge } from "./submission-toolbar-controls"

// ─── Main toolbar ─────────────────────────────────────────────────────────────

export function SubmissionToolbar({
	examPaperId,
	jobId,
	data,
	phase,
	scanPages,
	showOcr,
	showRegions,
	onToggleOcr,
	onToggleRegions,
}: {
	examPaperId: string
	jobId: string
	data: StudentPaperJobPayload
	phase: MarkingPhase
	scanPages: ScanPageUrl[]
	showOcr: boolean
	showRegions: boolean
	onToggleOcr: () => void
	onToggleRegions: () => void
}) {
	const hasOcr = scanPages.some((p) => p.analysis != null)
	const hasRegions = data.grading_results.some(
		(r) => (r.answer_regions?.length ?? 0) > 0,
	)

	const ocrDisabledReason = hasOcr ? undefined : "OCR not yet complete"
	const regionsDisabledReason = hasRegions
		? undefined
		: "Answer regions not yet available"

	const transcriptTriggerClass = cn(
		"inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors",
		"border-y border-r bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground",
		"rounded-l-md border-l",
		!hasOcr && "opacity-40 pointer-events-none",
	)

	const observationsTriggerClass = cn(
		"inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors",
		"border-y border-r bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground",
		"rounded-r-md",
		!hasOcr && "opacity-40 pointer-events-none",
	)

	return (
		<TooltipProvider>
			{/* ── Row 1: Context / breadcrumb ─────────────────────────────────── */}
			<div className="shrink-0 flex items-center gap-1.5 border-b bg-muted/40 px-4 h-9 text-sm">
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
				<StudentNameEditor jobId={jobId} initialName={data.student_name} />

				{phase === "completed" && data.total_max > 0 && (
					<span className="ml-2">
						<ScoreBadge awarded={data.total_awarded} max={data.total_max} />
					</span>
				)}
			</div>

			{/* ── Row 2: Tool strip ────────────────────────────────────────────── */}
			<div className="shrink-0 flex items-center gap-3 border-b bg-background px-4 h-11">
				{/* Overlay toggles group */}
				<div className="flex">
					<GroupToggle
						active={showOcr}
						disabled={!hasOcr}
						disabledReason={ocrDisabledReason}
						onClick={onToggleOcr}
						icon={<ScanText className="h-3.5 w-3.5" />}
						label="OCR"
						position="first"
					/>
					<GroupToggle
						active={showRegions}
						disabled={!hasRegions}
						disabledReason={regionsDisabledReason}
						onClick={onToggleRegions}
						icon={<MapPin className="h-3.5 w-3.5" />}
						label="Regions"
						position="last"
					/>
				</div>

				{/* View panels group */}
				<div className="flex">
					{hasOcr ? (
						<TranscriptSheet
							scanPages={scanPages}
							trigger={
								<button type="button" className={transcriptTriggerClass}>
									<FileText className="h-3.5 w-3.5" />
									<span className="hidden sm:inline">Transcript</span>
								</button>
							}
						/>
					) : (
						<Tooltip>
							<TooltipTrigger
								render={
									<span>
										<button
											type="button"
											disabled
											className={transcriptTriggerClass}
										>
											<FileText className="h-3.5 w-3.5" />
											<span className="hidden sm:inline">Transcript</span>
										</button>
									</span>
								}
							/>
							<TooltipContent side="bottom" sideOffset={6}>
								{ocrDisabledReason}
							</TooltipContent>
						</Tooltip>
					)}

					{hasOcr ? (
						<ObservationsSheet
							scanPages={scanPages}
							trigger={
								<button type="button" className={observationsTriggerClass}>
									<StickyNote className="h-3.5 w-3.5" />
									<span className="hidden sm:inline">Observations</span>
								</button>
							}
						/>
					) : (
						<Tooltip>
							<TooltipTrigger
								render={
									<span>
										<button
											type="button"
											disabled
											className={observationsTriggerClass}
										>
											<StickyNote className="h-3.5 w-3.5" />
											<span className="hidden sm:inline">Observations</span>
										</button>
									</span>
								}
							/>
							<TooltipContent side="bottom" sideOffset={6}>
								{ocrDisabledReason}
							</TooltipContent>
						</Tooltip>
					)}
				</div>

				{/* Spacer */}
				<div className="flex-1" />

				{/* Phase-conditional actions */}
				{phase === "completed" && (
					<div className="flex items-center gap-2">
						<DownloadPdfButton data={data} />
						<ReMarkButton jobId={jobId} />
						<Link
							href={`/teacher/exam-papers/${examPaperId}`}
							className={buttonVariants({ size: "sm" })}
						>
							<PlusCircle className="h-3.5 w-3.5 mr-1.5" />
							<span className="hidden sm:inline">Mark another</span>
						</Link>
					</div>
				)}

				{data.pages_count > 0 &&
					(phase === "scan_processing" || phase === "failed") && (
						<ReScanButton jobId={jobId} />
					)}
			</div>
		</TooltipProvider>
	)
}

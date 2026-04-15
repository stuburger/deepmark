"use client"

import { AnnotationLegend } from "@/components/BoundingBoxViewer/annotation-legend"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type {
	PageToken,
	ScanPageUrl,
	StudentPaperAnnotation,
	StudentPaperJobPayload,
} from "@/lib/marking/types"
import { cn } from "@/lib/utils"
import {
	BookOpen,
	ChevronDown,
	ChevronRight,
	FileText,
	Layers,
	Pencil,
	StickyNote,
} from "lucide-react"
import Link from "next/link"
import { ObservationsSheet, TranscriptSheet } from "./ocr-sheets"
import type { MarkingPhase } from "./phase"
import { ReScanButton } from "./re-scan-button"
import { DownloadPdfButton } from "./results/download-pdf-button"
import { ReRunMenu } from "./results/re-run-menu"
import { StudentNameEditor } from "./results/student-name-editor"
import { SubmissionFeedbackButton } from "./results/submission-feedback"
import { ScoreBadge } from "./submission-toolbar-controls"
import { VersionSwitcher } from "./version-switcher"

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
	showMarks = false,
	showChains = false,
	onToggleMarks,
	onToggleChains,
	onGenerateAnnotations,
	annotationCount,
	onNavigateToJob,
	onVersionChange,
	isEditing = false,
	onToggleEditing,
	annotations,
	pageTokens,
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
	showMarks?: boolean
	showChains?: boolean
	onToggleMarks?: () => void
	onToggleChains?: () => void
	onGenerateAnnotations?: () => void
	annotationCount?: number
	onNavigateToJob?: (newJobId: string) => void
	onVersionChange?: (newJobId: string) => void
	isEditing?: boolean
	onToggleEditing?: () => void
	annotations?: StudentPaperAnnotation[]
	pageTokens?: PageToken[]
}) {
	const hasOcr = scanPages.some((p) => p.analysis != null)
	const hasRegions = data.grading_results.some(
		(r) => (r.answer_regions?.length ?? 0) > 0,
	)

	// Enrichment is "complete" only when it produced actual annotations.
	// If enrichment ran but produced nothing (e.g. MCQ-only paper), controls stay disabled.
	const hasAnnotations =
		data.enrichment_status === "complete" && (annotationCount ?? 0) > 0
	const isEnriching =
		data.enrichment_status === "pending" ||
		data.enrichment_status === "processing"

	const annotationsDisabledReason = hasAnnotations
		? undefined
		: isEnriching
			? "Generating annotations..."
			: data.enrichment_status === "failed"
				? "Annotation generation failed — try again"
				: "Waiting for annotations..."

	// Annotations are available for all question types after Phase 4c/4d:
	// LoR → Gemini annotations; point_based + MCQ → deterministic tick/cross.
	// Show the Annotate button whenever grading is complete and there are results.
	const hasAnnotatableResults = data.grading_results.length > 0
	const canGenerate = phase === "completed" && hasAnnotatableResults

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
				{onVersionChange && (
					<VersionSwitcher jobId={jobId} onVersionChange={onVersionChange} />
				)}

				{phase === "completed" && data.total_max > 0 && (
					<span className="ml-2">
						<ScoreBadge awarded={data.total_awarded} max={data.total_max} />
					</span>
				)}
			</div>

			{/* ── Row 2: Tool strip ────────────────────────────────────────────── */}
			<div className="shrink-0 flex items-center gap-3 border-b bg-background px-4 h-11">
				{/* Overlay toggles — dropdown */}
				<DropdownMenu>
					<DropdownMenuTrigger
						className={cn(
							"inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors",
							"rounded-md border bg-background text-muted-foreground border-border",
							"hover:bg-muted hover:text-foreground",
							"data-popup-open:bg-muted data-popup-open:text-foreground",
						)}
					>
						<Layers className="h-3.5 w-3.5" />
						<span className="hidden sm:inline">Overlays</span>
						<ChevronDown className="h-3 w-3 opacity-50" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-40">
						<DropdownMenuCheckboxItem
							checked={showOcr}
							disabled={!hasOcr}
							onCheckedChange={() => onToggleOcr()}
						>
							Words
						</DropdownMenuCheckboxItem>
						{(onToggleMarks ?? onToggleChains) && (
							<DropdownMenuCheckboxItem
								checked={showMarks || showChains}
								disabled={!hasAnnotations}
								onCheckedChange={() => {
									onToggleMarks?.()
									onToggleChains?.()
								}}
							>
								Annotations
							</DropdownMenuCheckboxItem>
						)}
						<DropdownMenuCheckboxItem
							checked={showRegions}
							disabled={!hasRegions}
							onCheckedChange={() => onToggleRegions()}
						>
							Answers
						</DropdownMenuCheckboxItem>
					</DropdownMenuContent>
				</DropdownMenu>

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

				{/* Legend */}
				{hasAnnotations && (
					<AnnotationLegend
						gradingResults={data.grading_results}
						levelDescriptors={data.level_descriptors}
						trigger={
							<button
								type="button"
								className={cn(
									"inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors",
									"rounded-md border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
							>
								<BookOpen className="h-3.5 w-3.5" />
								<span className="hidden sm:inline">Legend</span>
							</button>
						}
					/>
				)}

				{/* Spacer */}
				<div className="flex-1" />

				{/* Phase-conditional actions */}
				{phase === "completed" && (
					<div className="flex items-center gap-2">
						{data.submission_id && (
							<SubmissionFeedbackButton submissionId={data.submission_id} />
						)}
						{onToggleEditing && (
							<Button
								size="sm"
								variant={isEditing ? "default" : "outline"}
								onClick={onToggleEditing}
							>
								<Pencil className="h-3.5 w-3.5 mr-1.5" />
								{isEditing ? "Done editing" : "Edit marking"}
							</Button>
						)}
						<DownloadPdfButton
							data={data}
							annotations={annotations}
							pageTokens={pageTokens}
						/>
						<ReRunMenu
							jobId={jobId}
							onNavigateToJob={onNavigateToJob ?? (() => {})}
							onReAnnotate={canGenerate ? onGenerateAnnotations : undefined}
						/>
					</div>
				)}

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

"use client"

import { AnnotationLegend } from "@/components/BoundingBoxViewer/annotation-legend"
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type {
	PageToken,
	ScanPage,
	StudentPaperAnnotation,
	StudentPaperJobPayload,
} from "@/lib/marking/types"
import { cn } from "@/lib/utils"
import {
	BookOpen,
	Check,
	ChevronDown,
	Copy,
	Crosshair,
	Layers,
	Lightbulb,
	ZoomIn,
} from "lucide-react"
import { useState } from "react"
import { ObservationsSheet } from "./ocr-sheets"
import { AnnotatedScanColumn } from "./results/annotated-scan-column"
import type { ScanViewSettings, ScanViewToggle } from "./use-scan-view-settings"

export function ScanPanel({
	scanPages,
	pageTokens,
	gradingResults,
	levelDescriptors,
	settings,
	toggle,
	onGradedRegionClick,
	debugMode,
	annotations = [],
	hasAnnotations = false,
	highlightedTokenIds,
}: {
	scanPages: ScanPage[]
	pageTokens: PageToken[]
	gradingResults: StudentPaperJobPayload["grading_results"]
	levelDescriptors?: string | null
	settings: ScanViewSettings
	toggle: ScanViewToggle
	onGradedRegionClick?: (questionNumber: string) => void
	debugMode?: boolean
	annotations?: StudentPaperAnnotation[]
	hasAnnotations?: boolean
	highlightedTokenIds?: Set<string> | null
}) {
	const {
		showOcr,
		showRegions,
		showMarks,
		showChains,
		showZoomControls,
		viewMode,
	} = settings
	const inspectMode = viewMode === "inspect"
	const [observationsOpen, setObservationsOpen] = useState(false)
	const [copied, setCopied] = useState(false)

	const hasOcr = scanPages.some((p) => p.analysis != null)
	const hasRegions = gradingResults.some(
		(r) => (r.answer_regions?.length ?? 0) > 0,
	)
	const ocrDisabledReason = hasOcr ? undefined : "OCR not yet complete"

	const handleCopyTranscript = () => {
		const text = scanPages
			.filter((p) => p.analysis?.transcript)
			.map((p) => p.analysis?.transcript ?? "")
			.join("\n\n")
		void navigator.clipboard.writeText(text).then(() => {
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		})
	}

	return (
		<TooltipProvider>
			<div className="flex flex-col h-full">
				{/* ── Scan panel header ─────────────────────────────────────────── */}
				<div className="shrink-0 flex items-center gap-1 border-b bg-background px-3 h-9">
					{/* Overlays dropdown */}
					<DropdownMenu>
						<DropdownMenuTrigger
							className={cn(
								"inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors",
								"text-muted-foreground hover:bg-muted hover:text-foreground",
								"data-popup-open:bg-muted data-popup-open:text-foreground",
							)}
						>
							<Layers className="h-3.5 w-3.5" />
							<ChevronDown className="h-3 w-3 opacity-50" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="w-40">
							<DropdownMenuCheckboxItem
								checked={showOcr}
								disabled={!hasOcr}
								onCheckedChange={() => toggle("showOcr")}
							>
								Words
							</DropdownMenuCheckboxItem>
							<DropdownMenuCheckboxItem
								checked={showMarks || showChains}
								disabled={!hasAnnotations}
								onCheckedChange={() => {
									toggle("showMarks")
									toggle("showChains")
								}}
							>
								Annotations
							</DropdownMenuCheckboxItem>
							<DropdownMenuCheckboxItem
								checked={showRegions}
								disabled={!hasRegions}
								onCheckedChange={() => toggle("showRegions")}
							>
								Answers
							</DropdownMenuCheckboxItem>
						</DropdownMenuContent>
					</DropdownMenu>

					<div className="h-3.5 w-px bg-border mx-1" />

					{/* Copy transcript */}
					<Tooltip>
						<TooltipTrigger
							render={
								<button
									type="button"
									disabled={!hasOcr}
									onClick={handleCopyTranscript}
									className={cn(
										"inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground transition-colors",
										"hover:bg-muted hover:text-foreground",
										!hasOcr && "opacity-40 pointer-events-none",
										copied && "text-green-600",
									)}
									aria-label="Copy transcript"
								>
									{copied ? (
										<Check className="h-3.5 w-3.5" />
									) : (
										<Copy className="h-3.5 w-3.5" />
									)}
								</button>
							}
						/>
						<TooltipContent side="bottom" sideOffset={6}>
							{!hasOcr
								? ocrDisabledReason
								: copied
									? "Copied!"
									: "Copy transcript"}
						</TooltipContent>
					</Tooltip>

					{/* Observations */}
					<Tooltip>
						<TooltipTrigger
							render={
								<button
									type="button"
									disabled={!hasOcr}
									onClick={() => setObservationsOpen(true)}
									className={cn(
										"inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground transition-colors",
										"hover:bg-muted hover:text-foreground",
										!hasOcr && "opacity-40 pointer-events-none",
									)}
									aria-label="View observations"
								>
									<Lightbulb className="h-3.5 w-3.5" />
								</button>
							}
						/>
						<TooltipContent side="bottom" sideOffset={6}>
							{!hasOcr ? ocrDisabledReason : "Observations"}
						</TooltipContent>
					</Tooltip>

					{/* Legend — only when annotations are available */}
					{hasAnnotations && (
						<>
							<div className="h-3.5 w-px bg-border mx-1" />
							<AnnotationLegend
								gradingResults={gradingResults}
								levelDescriptors={levelDescriptors ?? null}
								trigger={
									<button
										type="button"
										className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
									>
										<BookOpen className="h-3.5 w-3.5" />
									</button>
								}
							/>
						</>
					)}

					{/* Right-aligned mode toggles */}
					<div className="ml-auto flex items-center gap-0.5">
						<Tooltip>
							<TooltipTrigger
								render={
									<button
										type="button"
										onClick={() => toggle("viewMode")}
										className={cn(
											"inline-flex items-center justify-center h-6 w-6 rounded transition-colors",
											inspectMode
												? "bg-foreground text-background"
												: "text-muted-foreground hover:bg-muted hover:text-foreground",
										)}
										aria-pressed={inspectMode}
										aria-label="Toggle inspect mode"
									>
										<Crosshair className="h-3.5 w-3.5" />
									</button>
								}
							/>
							<TooltipContent side="bottom" sideOffset={6}>
								{inspectMode
									? "Inspect mode (word-level highlights)"
									: "Focus mode (no word highlights)"}
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger
								render={
									<button
										type="button"
										onClick={() => toggle("showZoomControls")}
										className={cn(
											"inline-flex items-center justify-center h-6 w-6 rounded transition-colors",
											showZoomControls
												? "bg-foreground text-background"
												: "text-muted-foreground hover:bg-muted hover:text-foreground",
										)}
										aria-pressed={showZoomControls}
										aria-label="Toggle zoom controls"
									>
										<ZoomIn className="h-3.5 w-3.5" />
									</button>
								}
							/>
							<TooltipContent side="bottom" sideOffset={6}>
								{showZoomControls ? "Hide zoom controls" : "Show zoom controls"}
							</TooltipContent>
						</Tooltip>
					</div>
				</div>

				{/* ── Scan content ──────────────────────────────────────────────── */}
				<ScrollArea className="flex-1 min-h-0 bg-muted/20">
					<AnnotatedScanColumn
						pages={scanPages}
						pageTokens={pageTokens}
						showHighlights={showOcr}
						showRegions={showRegions}
						gradingResults={gradingResults}
						onGradedRegionClick={onGradedRegionClick}
						debugMode={debugMode}
						annotations={annotations}
						showMarks={showMarks}
						showChains={showChains}
						highlightedTokenIds={highlightedTokenIds}
						showZoomControls={showZoomControls}
					/>
				</ScrollArea>

				<ObservationsSheet
					scanPages={scanPages}
					open={observationsOpen}
					onOpenChange={setObservationsOpen}
				/>
			</div>
		</TooltipProvider>
	)
}

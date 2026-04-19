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
	ScanPageUrl,
	StudentPaperAnnotation,
	StudentPaperJobPayload,
} from "@/lib/marking/types"
import { cn } from "@/lib/utils"
import {
	BookOpen,
	Check,
	ChevronDown,
	Copy,
	Layers,
	Lightbulb,
} from "lucide-react"
import { useState } from "react"
import { ObservationsSheet } from "./ocr-sheets"
import { AnnotatedScanColumn } from "./results/annotated-scan-column"

export function ScanPanel({
	scanPages,
	pageTokens,
	gradingResults,
	levelDescriptors,
	showOcr,
	showRegions,
	onToggleOcr,
	onToggleRegions,
	onAnnotationClick,
	debugMode,
	annotations = [],
	showMarks = false,
	showChains = false,
	onToggleMarks,
	onToggleChains,
	hasAnnotations = false,
	highlightedTokenIds,
}: {
	scanPages: ScanPageUrl[]
	pageTokens: PageToken[]
	gradingResults: StudentPaperJobPayload["grading_results"]
	levelDescriptors?: string | null
	showOcr: boolean
	showRegions: boolean
	onToggleOcr: () => void
	onToggleRegions: () => void
	onAnnotationClick?: (questionNumber: string) => void
	debugMode?: boolean
	annotations?: StudentPaperAnnotation[]
	showMarks?: boolean
	showChains?: boolean
	onToggleMarks?: () => void
	onToggleChains?: () => void
	hasAnnotations?: boolean
	highlightedTokenIds?: Set<string> | null
}) {
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
				</div>

				{/* ── Scan content ──────────────────────────────────────────────── */}
				<ScrollArea className="flex-1 min-h-0 bg-muted/20">
					<AnnotatedScanColumn
						pages={scanPages}
						pageTokens={pageTokens}
						showHighlights={showOcr}
						showRegions={showRegions}
						gradingResults={gradingResults}
						onAnnotationClick={onAnnotationClick}
						debugMode={debugMode}
						annotations={annotations}
						showMarks={showMarks}
						showChains={showChains}
						highlightedTokenIds={highlightedTokenIds}
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

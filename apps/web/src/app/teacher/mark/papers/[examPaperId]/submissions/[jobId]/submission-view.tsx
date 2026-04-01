"use client"

import { LiveMarkingExamPaperPanel } from "@/components/ExamPaperPanel"
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getJobPageTokens, getJobScanPageUrls } from "@/lib/marking/queries"
import type {
	PageToken,
	ScanPageUrl,
	StudentPaperJobPayload,
} from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { CancelledPanel } from "../../../../[jobId]/phases/cancelled"
import { FailedPanel } from "../../../../[jobId]/phases/failed"
import { AnnotatedScanColumn } from "../../../../[jobId]/phases/results/annotated-scan-column"

import { MarkingResults } from "../../../../[jobId]/phases/results/index"
import {
	type MarkingPhase,
	derivePhase,
} from "../../../../[jobId]/shared/phase"
import { useJobQuery } from "../../../../[jobId]/shared/use-job-query"
import { EventLog } from "./event-log"
import { SubmissionToolbar } from "./submission-toolbar"

const TERMINAL_STATUSES = new Set(["ocr_complete", "failed", "cancelled"])

// ─── Status label for scan-processing display ─────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
	pending: "Queued — waiting to start",
	processing: "Reading pages…",
	extracting: "Extracting text from scan…",
	extracted: "Text extracted",
	grading: "Marking answers against the mark scheme…",
}

function ScanProcessingDisplay({ status }: { status: string }) {
	const label = STATUS_LABELS[status] ?? `Processing (${status})`
	return (
		<div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
			<Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
			<div>
				<p className="text-sm font-medium">{label}</p>
				<p className="text-xs text-muted-foreground mt-0.5">
					Updating automatically…
				</p>
			</div>
		</div>
	)
}

// ─── Right panel: phase-switched digital paper content ────────────────────────

function DigitalPanelContent({
	jobId,
	data,
	phase,
	activeQuestionNumber,
}: {
	jobId: string
	data: StudentPaperJobPayload
	phase: MarkingPhase
	activeQuestionNumber: string | null
}) {
	switch (phase) {
		case "scan_processing":
			return <ScanProcessingDisplay status={data.status} />

		case "marking_in_progress":
			return (
				<LiveMarkingExamPaperPanel
					gradingResults={data.grading_results}
					extractedAnswers={data.extracted_answers ?? undefined}
					activeQuestionNumber={activeQuestionNumber}
				/>
			)

		case "completed":
			return (
				<MarkingResults
					jobId={jobId}
					data={data}
					activeQuestionNumber={activeQuestionNumber}
				/>
			)

		case "failed":
			return <FailedPanel data={data} jobId={jobId} />

		case "cancelled":
			return <CancelledPanel />
	}
}

// ─── Shared scan panel ────────────────────────────────────────────────────────

function ScanPanel({
	scanPages,
	pageTokens,
	gradingResults,
	showOcr,
	showRegions,
	onAnnotationClick,
	debugMode,
}: {
	scanPages: ScanPageUrl[]
	pageTokens: PageToken[]
	gradingResults: StudentPaperJobPayload["grading_results"]
	showOcr: boolean
	showRegions: boolean
	onAnnotationClick?: (questionNumber: string) => void
	debugMode?: boolean
}) {
	return (
		<ScrollArea className="h-full w-full bg-muted/20">
			<AnnotatedScanColumn
				pages={scanPages}
				pageTokens={pageTokens}
				showHighlights={showOcr}
				showRegions={showRegions}
				gradingResults={gradingResults}
				onAnnotationClick={onAnnotationClick}
				debugMode={debugMode}
			/>
		</ScrollArea>
	)
}

// ─── Shared results panel ─────────────────────────────────────────────────────

function ResultsPanel({
	jobId,
	data,
	phase,
	isPolling,
	activeQuestionNumber,
}: {
	jobId: string
	data: StudentPaperJobPayload
	phase: MarkingPhase
	isPolling: boolean
	activeQuestionNumber: string | null
}) {
	return (
		<ScrollArea data-results-panel className="h-full w-full">
			<div className="flex flex-col">
				<div className="flex-1 p-4 space-y-5 max-w-2xl w-full">
					<DigitalPanelContent
						jobId={jobId}
						data={data}
						phase={phase}
						activeQuestionNumber={activeQuestionNumber}
					/>
				</div>
				<EventLog events={data.job_events} isPolling={isPolling} />
			</div>
		</ScrollArea>
	)
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function SubmissionView({
	examPaperId,
	jobId,
	initialData,
	scanPages: initialScanPages,
	pageTokens: initialPageTokens,
	initialPhase,
	debugMode = false,
	mode = "page",
}: {
	examPaperId: string
	jobId: string
	initialData: StudentPaperJobPayload
	scanPages: ScanPageUrl[]
	pageTokens: PageToken[]
	initialPhase: MarkingPhase
	debugMode?: boolean
	mode?: "page" | "dialog"
}) {
	const queryClient = useQueryClient()
	const [showOcr, setShowOcr] = useState(false)
	const [showRegions, setShowRegions] = useState(true)
	const [activeQuestionNumber, setActiveQuestionNumber] = useState<
		string | null
	>(null)

	// Live job data — replaces useState(initialData) + useJobPoller
	const { data: jobData } = useJobQuery(jobId, initialData)
	const data = jobData ?? initialData
	const phase = derivePhase(data)
	const isTerminal = TERMINAL_STATUSES.has(data.status)
	const isPolling = !isTerminal

	// Scan pages — seeded with SSR data, refetched when OCR populates page.analysis
	const { data: scanPages } = useQuery({
		queryKey: queryKeys.jobScanUrls(jobId),
		queryFn: async () => {
			const r = await getJobScanPageUrls(jobId)
			return r.ok ? r.pages : []
		},
		initialData: initialScanPages,
		staleTime: Number.POSITIVE_INFINITY,
	})

	// Page tokens — seeded with SSR data, stable after initial load
	const { data: pageTokens } = useQuery({
		queryKey: queryKeys.jobPageTokens(jobId),
		queryFn: async () => {
			const r = await getJobPageTokens(jobId)
			return r.ok ? r.tokens : []
		},
		initialData: initialPageTokens,
		staleTime: Number.POSITIVE_INFINITY,
	})

	// When OCR completes (scan_processing → marking_in_progress), invalidate the
	// scan URLs query so page.analysis data is fetched. This replaces the old
	// router.refresh() which re-ran the entire server component just for this.
	const prevPhaseRef = useRef(initialPhase)
	useEffect(() => {
		if (
			prevPhaseRef.current === "scan_processing" &&
			phase === "marking_in_progress"
		) {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.jobScanUrls(jobId),
			})
		}
		prevPhaseRef.current = phase
	}, [phase, jobId, queryClient])

	const scrollToQuestion = useCallback((questionNumber: string) => {
		setActiveQuestionNumber(questionNumber)
		// Find the panel root, then its ScrollArea viewport (the actual scrollable
		// element). Both mobile and desktop layouts render DigitalPanelContent
		// simultaneously (one is CSS-hidden), so querying within the panel
		// guarantees we target the visible desktop element.
		const panelRoot = document.querySelector(
			"[data-results-panel]",
		) as HTMLElement | null
		if (!panelRoot) return
		const viewport = panelRoot.querySelector(
			"[data-slot='scroll-area-viewport']",
		) as HTMLElement | null
		const scrollEl = viewport ?? panelRoot
		const el = scrollEl.querySelector(
			`[id="question-${questionNumber}"]`,
		) as HTMLElement | null
		if (!el) return
		const scrollRect = scrollEl.getBoundingClientRect()
		const elRect = el.getBoundingClientRect()
		scrollEl.scrollTo({
			top: scrollEl.scrollTop + (elRect.top - scrollRect.top) - 16,
			behavior: "smooth",
		})
	}, [])

	return (
		<div
			className={
				mode === "dialog"
					? "flex flex-col overflow-hidden h-full"
					: "-m-6 flex flex-col overflow-hidden h-dvh"
			}
		>
			<SubmissionToolbar
				examPaperId={examPaperId}
				jobId={jobId}
				data={data}
				phase={phase}
				scanPages={scanPages}
				showOcr={showOcr}
				showRegions={showRegions}
				onToggleOcr={() => setShowOcr((v) => !v)}
				onToggleRegions={() => setShowRegions((v) => !v)}
			/>

			{/* Mobile: scan/results tabs */}
			<div className="flex-1 min-h-0 flex flex-col md:hidden">
				<Tabs
					defaultValue={
						initialPhase === "completed" ||
						initialPhase === "failed" ||
						initialPhase === "cancelled"
							? "results"
							: "scan"
					}
					className="h-full flex flex-col overflow-hidden gap-0"
				>
					<TabsList
						variant="line"
						className="shrink-0 w-full justify-start rounded-none border-b px-4 h-9 gap-4"
					>
						<TabsTrigger value="scan">Scan</TabsTrigger>
						<TabsTrigger value="results">Results</TabsTrigger>
					</TabsList>

					<TabsContent
						value="scan"
						className="flex-1 min-h-0 overflow-hidden bg-muted/20 m-0 p-0"
					>
						<ScrollArea className="h-full w-full">
							<AnnotatedScanColumn
								pages={scanPages}
								pageTokens={pageTokens}
								showHighlights={showOcr}
								showRegions={showRegions}
								gradingResults={data.grading_results}
								onAnnotationClick={scrollToQuestion}
								debugMode={debugMode}
							/>
						</ScrollArea>
					</TabsContent>

					<TabsContent
						value="results"
						className="flex-1 min-h-0 overflow-hidden m-0"
					>
						<ScrollArea className="h-full w-full">
							<div className="p-4 space-y-5 max-w-2xl">
								<DigitalPanelContent
									jobId={jobId}
									data={data}
									phase={phase}
									activeQuestionNumber={activeQuestionNumber}
								/>
							</div>
							<EventLog events={data.job_events} isPolling={isPolling} />
						</ScrollArea>
					</TabsContent>
				</Tabs>
			</div>

			{/* Desktop: persistent split layout */}
			<ResizablePanelGroup
				orientation="horizontal"
				className="flex-1 min-h-0 hidden md:flex"
			>
				<ResizablePanel defaultSize={55} minSize={35}>
					<ScanPanel
						scanPages={scanPages}
						pageTokens={pageTokens}
						gradingResults={data.grading_results}
						showOcr={showOcr}
						showRegions={showRegions}
						onAnnotationClick={scrollToQuestion}
						debugMode={debugMode}
					/>
				</ResizablePanel>

				<ResizableHandle withHandle />

				<ResizablePanel defaultSize={45} minSize={30}>
					<ResultsPanel
						jobId={jobId}
						data={data}
						phase={phase}
						isPolling={isPolling}
						activeQuestionNumber={activeQuestionNumber}
					/>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	)
}

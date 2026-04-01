"use client"

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
import { useCallback, useEffect, useRef, useState } from "react"
import { AnnotatedScanColumn } from "../../../../[jobId]/phases/results/annotated-scan-column"
import type { MarkingPhase } from "../../../../[jobId]/shared/phase"
import { derivePhase } from "../../../../[jobId]/shared/phase"
import { useJobQuery } from "../../../../[jobId]/shared/use-job-query"
import { useScrollToQuestion } from "./hooks/use-scroll-to-question"
import { ResultsPanel } from "./results-panel"
import { ScanPanel } from "./scan-panel"
import { SubmissionToolbar } from "./submission-toolbar"

const TERMINAL_STATUSES = new Set(["ocr_complete", "failed", "cancelled"])

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
	const { activeQuestionNumber, scrollToQuestion } = useScrollToQuestion()

	const isTerminalPhase =
		initialPhase === "completed" ||
		initialPhase === "failed" ||
		initialPhase === "cancelled"

	const [mobileTab, setMobileTab] = useState(
		isTerminalPhase ? "results" : "scan",
	)

	// When an annotation is clicked, switch the mobile tab to "results" so the
	// card is in the DOM and visible before scrollToQuestion runs its rAF.
	const handleAnnotationClick = useCallback(
		(questionNumber: string) => {
			setMobileTab("results")
			scrollToQuestion(questionNumber)
		},
		[scrollToQuestion],
	)

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
					value={mobileTab}
					onValueChange={setMobileTab}
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
								onAnnotationClick={handleAnnotationClick}
								debugMode={debugMode}
							/>
						</ScrollArea>
					</TabsContent>

					<TabsContent
						value="results"
						className="flex-1 min-h-0 overflow-hidden m-0"
					>
						<ResultsPanel
							jobId={jobId}
							data={data}
							phase={phase}
							isPolling={isPolling}
							activeQuestionNumber={activeQuestionNumber}
						/>
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
						onAnnotationClick={handleAnnotationClick}
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

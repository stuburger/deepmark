"use client"

import { useAnnotationSync } from "@/components/annotated-answer/use-annotation-sync"
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { triggerEnrichment } from "@/lib/marking/stages/mutations"
import type { JobStages } from "@/lib/marking/stages/types"
import type {
	PageToken,
	ScanPageUrl,
	StudentPaperJobPayload,
	UpsertTeacherOverrideInput,
} from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { parseAsString, useQueryState } from "nuqs"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { EventLog } from "./event-log"
import { useScrollToQuestion } from "./hooks/use-scroll-to-question"
import { useSubmissionData } from "./hooks/use-submission-data"
import {
	useTeacherOverrideMutations,
	useTeacherOverrides,
} from "./hooks/use-teacher-overrides"
import { ResultsPanel } from "./results-panel"
import { AnnotatedScanColumn } from "./results/annotated-scan-column"
import { ScanPanel } from "./scan-panel"
import { SubmissionToolbar } from "./submission-toolbar"

export function SubmissionView({
	examPaperId,
	jobId,
	initialData,
	scanPages: initialScanPages,
	pageTokens: initialPageTokens,
	initialStages,
	debugMode = false,
	onNavigateToJob,
	onVersionChange,
}: {
	examPaperId: string
	jobId: string
	initialData: StudentPaperJobPayload
	scanPages: ScanPageUrl[]
	pageTokens: PageToken[]
	initialStages: JobStages
	debugMode?: boolean
	onNavigateToJob?: (newJobId: string) => void
	onVersionChange?: (newJobId: string) => void
}) {
	const queryClient = useQueryClient()

	const {
		data,
		stages,
		scanPages,
		pageTokens,
		annotations,
		phase,
		isTerminal,
	} = useSubmissionData({
		jobId,
		initialData,
		initialScanPages,
		initialPageTokens,
		initialStages,
	})

	const [showOcr, setShowOcr] = useState(false)
	const [showRegions, setShowRegions] = useState(true)
	const [showMarks, setShowMarks] = useState(false)
	const [showChains, setShowChains] = useState(false)

	// Hover word linking — bidirectional between scan and PM editor
	const [highlightedTokenIds, setHighlightedTokenIds] =
		useState<Set<string> | null>(null)
	const handleTokenHighlight = useCallback((tokenIds: string[] | null) => {
		setHighlightedTokenIds(tokenIds ? new Set(tokenIds) : null)
	}, [])

	const [activeQuestionNumber, setActiveQuestionNumber] = useQueryState(
		"question",
		parseAsString,
	)
	const scrollToQuestion = useScrollToQuestion(setActiveQuestionNumber)

	const [mobileTab, setMobileTab] = useState(
		phase === "completed" || phase === "failed" || phase === "cancelled"
			? "results"
			: "scan",
	)

	// When an annotation is clicked, switch the mobile tab to "results" so the
	// question is in the DOM and visible before scrollToQuestion runs its rAF.
	const handleAnnotationClick = useCallback(
		(questionNumber: string) => {
			setMobileTab("results")
			scrollToQuestion(questionNumber)
		},
		[scrollToQuestion],
	)

	// Teacher overrides
	const { overridesByQuestionId } = useTeacherOverrides(
		initialData.submission_id,
	)
	const { upsertOverride, deleteOverride } = useTeacherOverrideMutations(
		initialData.submission_id,
	)

	const handleOverrideChange = useCallback(
		(questionId: string, input: UpsertTeacherOverrideInput | null) => {
			if (input === null) {
				deleteOverride(questionId)
			} else {
				upsertOverride({ questionId, input })
			}
		},
		[upsertOverride, deleteOverride],
	)

	// Auto-enable marks overlay when annotations first load
	const annotationsLoadedRef = useRef(false)
	useEffect(() => {
		if (annotations.length > 0 && !annotationsLoadedRef.current) {
			annotationsLoadedRef.current = true
			setShowMarks(true)
		}
	}, [annotations])

	// Unified sync: editor transactions → React Query cache → server.
	// The `jobAnnotations` cache is the single source of truth for
	// annotations (AI + teacher). The callback writes derived state into the
	// cache and schedules a debounced save mutation that races safely against
	// enrichment refetches via `cancelQueries` in `onMutate`.
	const handleDerivedAnnotations = useAnnotationSync(jobId)

	const enrichMutation = useMutation({
		mutationFn: () => triggerEnrichment(jobId),
		onSuccess: (result) => {
			if (!result.ok) {
				toast.error(result.error)
				return
			}
			toast.success("Annotation generation started")
			void queryClient.invalidateQueries({
				queryKey: queryKeys.studentJob(jobId),
			})
		},
		onError: () => toast.error("Failed to start annotation generation"),
	})

	return (
		<div className="flex flex-col overflow-hidden h-full">
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
				showMarks={showMarks}
				showChains={showChains}
				onToggleMarks={() => setShowMarks((v) => !v)}
				onToggleChains={() => setShowChains((v) => !v)}
				onGenerateAnnotations={() => enrichMutation.mutate()}
				annotationCount={annotations.length}
				onNavigateToJob={onNavigateToJob}
				onVersionChange={onVersionChange}
				annotations={annotations}
				pageTokens={pageTokens}
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
								annotations={annotations}
								showMarks={showMarks}
								showChains={showChains}
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
							activeQuestionNumber={activeQuestionNumber}
							annotations={annotations}
							pageTokens={pageTokens}
							overridesByQuestionId={overridesByQuestionId}
							onOverrideChange={handleOverrideChange}
							onDerivedAnnotations={handleDerivedAnnotations}
							onTokenHighlight={handleTokenHighlight}
						/>
					</TabsContent>
				</Tabs>
			</div>

			{/* Desktop: persistent split layout */}
			<ResizablePanelGroup
				orientation="horizontal"
				className="flex-1 min-h-0 hidden md:flex"
			>
				<ResizablePanel defaultSize={30} minSize={20}>
					<ScanPanel
						scanPages={scanPages}
						pageTokens={pageTokens}
						gradingResults={data.grading_results}
						showOcr={showOcr}
						showRegions={showRegions}
						onAnnotationClick={handleAnnotationClick}
						debugMode={debugMode}
						annotations={annotations}
						showMarks={showMarks}
						showChains={showChains}
						highlightedTokenIds={highlightedTokenIds}
					/>
				</ResizablePanel>

				<ResizableHandle withHandle />

				<ResizablePanel defaultSize={70} minSize={40}>
					<ResultsPanel
						jobId={jobId}
						data={data}
						phase={phase}
						activeQuestionNumber={activeQuestionNumber}
						annotations={annotations}
						pageTokens={pageTokens}
						overridesByQuestionId={overridesByQuestionId}
						onOverrideChange={handleOverrideChange}
						onDerivedAnnotations={handleDerivedAnnotations}
						onTokenHighlight={handleTokenHighlight}
					/>
				</ResizablePanel>
			</ResizablePanelGroup>

			<EventLog events={data.job_events} isPolling={!isTerminal} />
		</div>
	)
}

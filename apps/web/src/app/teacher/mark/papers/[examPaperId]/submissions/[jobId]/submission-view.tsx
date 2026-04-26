"use client"

import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { JobStages } from "@/lib/marking/stages/types"
import type {
	PageToken,
	ScanPage,
	StudentPaperAnnotation,
	StudentPaperJobPayload,
	UpsertTeacherOverrideInput,
} from "@/lib/marking/types"
import { parseAsString, useQueryState } from "nuqs"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { EventLog } from "./event-log"
import { useScrollToQuestion } from "./hooks/use-scroll-to-question"
import { useSubmissionData } from "./hooks/use-submission-data"
import {
	useTeacherOverrideMutations,
	useTeacherOverrides,
} from "./hooks/use-teacher-overrides"
import { ResultsPanel } from "./results-panel"
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
	onClose,
}: {
	examPaperId: string
	jobId: string
	initialData: StudentPaperJobPayload
	scanPages: ScanPage[]
	pageTokens: PageToken[]
	initialStages: JobStages
	debugMode?: boolean
	onNavigateToJob?: (newJobId: string) => void
	onVersionChange?: (newJobId: string) => void
	onClose?: () => void
}) {
	const {
		data,
		stages,
		scanPages,
		pageTokens,
		annotations: serverAnnotations,
		phase,
		isTerminal,
	} = useSubmissionData({
		jobId,
		initialData,
		initialScanPages,
		initialPageTokens,
		initialStages,
	})

	// Editor-derived annotations (anchored to ocrToken marks in the PM doc).
	// `null` until the editor mounts and emits its first derivation; until
	// then we fall back to anchored annotations from the server projection.
	// After the editor has produced a derivation, it's authoritative for
	// anchored marks — server projection only feeds spatial-only marks
	// (MCQ / deterministic, no anchor tokens) which never live in the doc.
	const [editorAnnotations, setEditorAnnotations] = useState<
		StudentPaperAnnotation[] | null
	>(null)

	const annotations = useMemo<StudentPaperAnnotation[]>(() => {
		const spatialOnly = serverAnnotations.filter(
			(a) => !a.anchor_token_start_id || !a.anchor_token_end_id,
		)
		const anchored =
			editorAnnotations ??
			serverAnnotations.filter(
				(a) => a.anchor_token_start_id && a.anchor_token_end_id,
			)
		return [...anchored, ...spatialOnly]
	}, [editorAnnotations, serverAnnotations])

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

	// When a graded region is clicked, switch the mobile tab to "results" so the
	// question is in the DOM and visible before scrollToQuestion runs its rAF.
	const handleGradedRegionClick = useCallback(
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

	const hasAnnotations =
		data.annotation_status === "complete" && annotations.length > 0

	// Auto-enable marks overlay when annotations first load
	const annotationsLoadedRef = useRef(false)
	useEffect(() => {
		if (annotations.length > 0 && !annotationsLoadedRef.current) {
			annotationsLoadedRef.current = true
			setShowMarks(true)
		}
	}, [annotations])

	// Editor transactions → local state, fanned out to ScanPanel and
	// SubmissionToolbar via the merged `annotations` above. The Y.Doc (via
	// Hocuspocus + IndexedDB) is the persistence layer; the React Query cache
	// is reserved for server-projected state and never written by the editor.
	const handleDerivedAnnotations = useCallback(
		(derived: StudentPaperAnnotation[]) => setEditorAnnotations(derived),
		[],
	)

	// Drop the previous editor's derivation when the submission switches —
	// otherwise ScanPanel briefly shows stale anchored marks until the new
	// editor mounts and re-derives.
	useEffect(() => {
		setEditorAnnotations(null)
	}, [jobId])

	return (
		<div className="flex flex-col overflow-hidden h-full">
			<SubmissionToolbar
				examPaperId={examPaperId}
				jobId={jobId}
				data={data}
				phase={phase}
				onNavigateToJob={onNavigateToJob}
				onVersionChange={onVersionChange}
				onClose={onClose}
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
						className="flex-1 min-h-0 overflow-hidden m-0 p-0"
					>
						<ScanPanel
							scanPages={scanPages}
							pageTokens={pageTokens}
							gradingResults={data.grading_results}
							levelDescriptors={data.level_descriptors}
							showOcr={showOcr}
							showRegions={showRegions}
							onToggleOcr={() => setShowOcr((v) => !v)}
							onToggleRegions={() => setShowRegions((v) => !v)}
							onGradedRegionClick={handleGradedRegionClick}
							debugMode={debugMode}
							annotations={annotations}
							showMarks={showMarks}
							showChains={showChains}
							onToggleMarks={() => setShowMarks((v) => !v)}
							onToggleChains={() => setShowChains((v) => !v)}
							hasAnnotations={hasAnnotations}
						/>
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
						levelDescriptors={data.level_descriptors}
						showOcr={showOcr}
						showRegions={showRegions}
						onToggleOcr={() => setShowOcr((v) => !v)}
						onToggleRegions={() => setShowRegions((v) => !v)}
						onGradedRegionClick={handleGradedRegionClick}
						debugMode={debugMode}
						annotations={annotations}
						showMarks={showMarks}
						showChains={showChains}
						onToggleMarks={() => setShowMarks((v) => !v)}
						onToggleChains={() => setShowChains((v) => !v)}
						hasAnnotations={hasAnnotations}
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

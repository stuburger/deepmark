"use client"

import { DocOpsProvider } from "@/components/annotated-answer/doc-ops-provider"
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useIsMobile } from "@/hooks/use-mobile"
import { useTeacherOverrides } from "@/lib/marking/overrides/hooks"
import type { JobStages } from "@/lib/marking/stages/types"
import type {
	PageToken,
	ScanPage,
	StudentPaperAnnotation,
	StudentPaperJobPayload,
} from "@/lib/marking/types"
import { useCurrentUser } from "@/lib/users/use-current-user"
import { parseAsString, useQueryState } from "nuqs"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { EventLog } from "./event-log"
import { useScrollToQuestion } from "./hooks/use-scroll-to-question"
import { useSubmissionData } from "./hooks/use-submission-data"
import { ResultsPanel } from "./results-panel"
import { ScanPanel } from "./scan-panel"
import { SubmissionToolbar } from "./submission-toolbar"
import { useScanViewSettings } from "./use-scan-view-settings"

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
	paperAccessible = true,
	readOnly = false,
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
	/**
	 * Whether the viewer can navigate to the parent exam paper. Defaults to
	 * true (paper owners / editors / paper-level viewers). Set false for
	 * submission-only grant holders so the breadcrumb's paper-title link
	 * doesn't render a dead link to a 403/404 page.
	 */
	paperAccessible?: boolean
	/**
	 * Viewer has read-only access (submission viewer role, no editor/owner).
	 * Surfaced as a badge in the toolbar so the lack of edit affordances
	 * isn't confusing — server-side mutations will reject regardless.
	 */
	readOnly?: boolean
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
	//
	// State is tagged with the jobId it was derived for, so switching
	// submissions auto-invalidates the prior derivation without an explicit
	// clear-effect. See https://react.dev/learn/you-might-not-need-an-effect.
	const [derived, setDerived] = useState<{
		jobId: string
		annotations: StudentPaperAnnotation[]
	} | null>(null)
	const editorAnnotations =
		derived?.jobId === jobId ? derived.annotations : null

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

	// Focus mode (default) treats the scan as a passive preview: clicking an
	// annotation or moving the editor cursor does NOT highlight individual
	// words on the scan. Inspect mode opts back into word-level linking for
	// debugging / OCR review. Some teachers find word-level flicker
	// distracting at normal marking speed.
	const { settings, toggle, set } = useScanViewSettings()
	const inspectMode = settings.viewMode === "inspect"

	const { isAdmin } = useCurrentUser()

	// Hover word linking — bidirectional between scan and PM editor.
	// In focus mode we throw away highlight events at the boundary so the
	// scan remains static.
	const [highlightedTokenIds, setHighlightedTokenIds] =
		useState<Set<string> | null>(null)
	const handleTokenHighlight = useCallback(
		(tokenIds: string[] | null) => {
			if (!inspectMode) {
				setHighlightedTokenIds(null)
				return
			}
			setHighlightedTokenIds(tokenIds ? new Set(tokenIds) : null)
		},
		[inspectMode],
	)
	// Clear lingering highlights when the user flips back to focus mode.
	useEffect(() => {
		if (!inspectMode) setHighlightedTokenIds(null)
	}, [inspectMode])

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

	// Teacher overrides — read-side only. Write ops live in DocOpsProvider
	// (consumed by NodeViews via `useDocOps()` so we don't drill callbacks
	// through ResultsPanel → MarkingResults → GradingResultsPanel).
	const { overridesByQuestionId } = useTeacherOverrides(
		initialData.submission_id,
	)

	const hasAnnotations =
		data.annotation_status === "complete" && annotations.length > 0

	// Auto-enable marks overlay when annotations first load
	const annotationsLoadedRef = useRef(false)
	useEffect(() => {
		if (annotations.length > 0 && !annotationsLoadedRef.current) {
			annotationsLoadedRef.current = true
			set({ showMarks: true })
		}
	}, [annotations, set])

	// Editor transactions → local state, fanned out to ScanPanel and
	// SubmissionToolbar via the merged `annotations` above. The Y.Doc (via
	// Hocuspocus + IndexedDB) is the persistence layer; the React Query cache
	// is reserved for server-projected state and never written by the editor.
	const handleDerivedAnnotations = useCallback(
		(annotations: StudentPaperAnnotation[]) =>
			setDerived({ jobId, annotations }),
		[jobId],
	)

	// Fallback to jobId for legacy submissions that predate the Submission
	// model — matches the docKey convention in grading-results-panel.tsx so
	// writes target the same Y.Doc.
	const docSubmissionId = initialData.submission_id ?? jobId

	// Mount only one layout at a time. Tailwind `hidden md:flex` /
	// `md:hidden` only toggles CSS visibility; both subtrees would otherwise
	// stay mounted, both <ResultsPanel> instances would render their own
	// TipTap editor, both editors would share a single awareness via
	// useYDoc, and they'd fight over the `cursor` field — producing an
	// infinite ping-pong of awareness updates and the WS-message storm.
	const isMobile = useIsMobile()

	return (
		<DocOpsProvider submissionId={docSubmissionId}>
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
					paperAccessible={paperAccessible}
					readOnly={readOnly}
				/>

				{/* Mobile: scan/results tabs */}
				{isMobile && (
					<div className="flex-1 min-h-0 flex flex-col">
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
									submissionId={docSubmissionId}
									scanPages={scanPages}
									pageTokens={pageTokens}
									gradingResults={data.grading_results}
									levelDescriptors={data.level_descriptors}
									settings={settings}
									toggle={toggle}
									onGradedRegionClick={handleGradedRegionClick}
									debugMode={debugMode}
									annotations={annotations}
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
									onDerivedAnnotations={handleDerivedAnnotations}
									onTokenHighlight={handleTokenHighlight}
								/>
							</TabsContent>
						</Tabs>
					</div>
				)}

				{/* Desktop: persistent split layout */}
				{!isMobile && (
					<ResizablePanelGroup
						orientation="horizontal"
						className="flex-1 min-h-0 flex"
					>
						<ResizablePanel defaultSize={20} minSize={15}>
							<ScanPanel
								submissionId={docSubmissionId}
								scanPages={scanPages}
								pageTokens={pageTokens}
								gradingResults={data.grading_results}
								levelDescriptors={data.level_descriptors}
								settings={settings}
								toggle={toggle}
								onGradedRegionClick={handleGradedRegionClick}
								debugMode={debugMode}
								annotations={annotations}
								hasAnnotations={hasAnnotations}
								highlightedTokenIds={highlightedTokenIds}
							/>
						</ResizablePanel>

						<ResizableHandle withHandle />

						<ResizablePanel defaultSize={80} minSize={50}>
							<ResultsPanel
								jobId={jobId}
								data={data}
								phase={phase}
								activeQuestionNumber={activeQuestionNumber}
								overridesByQuestionId={overridesByQuestionId}
								onDerivedAnnotations={handleDerivedAnnotations}
								onTokenHighlight={handleTokenHighlight}
							/>
						</ResizablePanel>
					</ResizablePanelGroup>
				)}

				{isAdmin && (
					<EventLog events={data.job_events} isPolling={!isTerminal} />
				)}
			</div>
		</DocOpsProvider>
	)
}

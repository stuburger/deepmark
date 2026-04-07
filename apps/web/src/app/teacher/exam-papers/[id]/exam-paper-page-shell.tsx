"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { commitBatch, updateStagedScript } from "@/lib/batch/mutations"
import { getActiveBatchForPaper } from "@/lib/batch/queries"
import type { ActiveBatchInfo } from "@/lib/batch/types"
import { deleteExamPaper } from "@/lib/exam-paper/mutations"
import type {
	ExamPaperDetail,
	UnlinkedMarkScheme,
} from "@/lib/exam-paper/queries"
import { listSubmissionsForPaper } from "@/lib/marking/queries"
import type { ExamPaperStats, SubmissionHistoryItem } from "@/lib/marking/types"
import type {
	ActiveExamPaperIngestionJob,
	PdfDocument,
} from "@/lib/pdf-ingestion/queries"
import { queryKeys } from "@/lib/query-keys"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	AlertTriangle,
	Globe,
	Loader2,
	Lock,
	PenLine,
	Trash2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { parseAsString, parseAsStringEnum, useQueryState } from "nuqs"
import { useState } from "react"
import { toast } from "sonner"
import { DocumentUploadCards } from "./document-upload-cards"
import { EditableTitle } from "./editable-title"
import { ExamPaperAnalyticsTab } from "./exam-paper-analytics-tab"
import { capitalize } from "./exam-paper-helpers"
import { ExamPaperQuestionsCard } from "./exam-paper-questions-card"
import { useExamPaperLiveQueries } from "./hooks/use-exam-paper-live-queries"
import { useLinkMarkScheme } from "./hooks/use-exam-paper-mutations"
import { useSimilarQuestions } from "./hooks/use-similar-questions"
import { useUnlinkedSchemes } from "./hooks/use-unlinked-schemes"
import { LevelDescriptorsCard } from "./level-descriptors-card"
import { LinkMarkSchemeDialog } from "./link-mark-scheme-dialog"
import { MarkingJobDialog } from "./marking-job-dialog"
import { StagingReviewDialog } from "./staging-review-dialog"
import { SubmissionGrid } from "./submission-grid"
import { TERMINAL_STATUSES } from "./submission-grid-config"
import { SubmissionTable } from "./submission-table"
import { UnlinkedSchemesPanel } from "./unlinked-schemes-panel"
import { UploadScriptsDialog } from "./upload-scripts-dialog"
import { ViewToggle } from "./view-toggle"

export function ExamPaperPageShell({
	paper: initialPaper,
	initialLiveState = { ok: true as const, jobs: [], documents: [] },
	initialSubmissions = [],
	initialAnalytics = null,
}: {
	paper: ExamPaperDetail
	initialLiveState?: {
		ok: true
		jobs: ActiveExamPaperIngestionJob[]
		documents: PdfDocument[]
	}
	initialSubmissions?: SubmissionHistoryItem[]
	initialAnalytics?: ExamPaperStats | null
}) {
	const router = useRouter()
	const queryClient = useQueryClient()

	// Tab navigation — synced with ?tab= search param via nuqs
	const [activeTab, setActiveTab] = useQueryState(
		"tab",
		parseAsStringEnum(["paper", "submissions", "analytics"]).withDefault(
			"paper",
		),
	)

	// Grid vs table view for submissions
	const [subView, setSubView] = useQueryState(
		"submissions_view",
		parseAsStringEnum(["grid", "table"]).withDefault("grid"),
	)

	// List vs grid view for staged script review
	const [stagingView, setStagingView] = useQueryState(
		"staging_view",
		parseAsStringEnum(["list", "grid"]).withDefault("list"),
	)

	// Live exam paper data, ingestion state, and analytics
	const { paper, jobs, completedDocs, analyticsStats, analyticsLoading } =
		useExamPaperLiveQueries({
			initialPaper,
			initialLiveState,
			initialAnalytics,
			activeTab,
		})

	// Similarity / duplicate detection
	const [duplicateBannerDismissed, setDuplicateBannerDismissed] =
		useState(false)
	const { data: similarPairs = [] } = useSimilarQuestions(paper.id)

	// Unlinked mark schemes
	const [linkingItem, setLinkingItem] = useState<UnlinkedMarkScheme | null>(
		null,
	)
	const [linkingTargetId, setLinkingTargetId] = useState<string>("")
	const { data: unlinkedItems = [] } = useUnlinkedSchemes(paper.id)

	// Upload scripts
	const [uploadOpen, setUploadOpen] = useState(false)
	const [stagingOpen, setStagingOpen] = useState(false)
	const [markingJobId, setMarkingJobId] = useQueryState("job", parseAsString)
	const [committingBatch, setCommittingBatch] = useState(false)

	// Active batch — polls every 3s while classifying, staging, or marking
	const { data: activeBatch, refetch: refetchActiveBatch } =
		useQuery<ActiveBatchInfo>({
			queryKey: ["activeBatch", paper.id],
			queryFn: async () => {
				const r = await getActiveBatchForPaper(paper.id)
				return r.ok ? r.batch : null
			},
			refetchInterval: (q) => {
				const b = q.state.data
				return b?.status === "classifying" ||
					b?.status === "staging" ||
					b?.status === "marking"
					? 3000
					: false
			},
			// Auto-open the staging dialog when classification completes
			select: (batch) => {
				if (batch?.status === "staging" && !stagingOpen) {
					setStagingOpen(true)
				}
				return batch
			},
		})

	// Live submissions list — polls every 3s while marking is active
	const { data: submissions = [] } = useQuery({
		queryKey: queryKeys.submissions(paper.id),
		queryFn: async () => {
			const r = await listSubmissionsForPaper(paper.id)
			return r.ok ? r.submissions : []
		},
		initialData: initialSubmissions,
		refetchInterval: activeBatch?.status === "marking" ? 3000 : false,
	})

	async function handleCommitAll() {
		if (!activeBatch) return
		setCommittingBatch(true)
		const r = await commitBatch(activeBatch.id)
		setCommittingBatch(false)
		if (!r.ok) {
			toast.error(r.error)
			return
		}
		void refetchActiveBatch()
	}

	// Delete exam paper
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const { mutate: doDeletePaper, isPending: deleting } = useMutation({
		mutationFn: () => deleteExamPaper(paper.id),
		onMutate: () => setDeleteDialogOpen(false),
		onSuccess: (result) => {
			if (!result.ok) {
				toast.error(result.error)
				return
			}
			router.push("/teacher/exam-papers")
		},
		onError: () => toast.error("Failed to delete exam paper"),
	})

	// Link mark scheme mutation
	const { mutate: doLinkMarkScheme, isPending: linkingBusy } =
		useLinkMarkScheme(paper.id)

	// Derived readiness state
	const hasQuestionPaper =
		completedDocs.some((d) => d.document_type === "question_paper") ||
		paper.questions.some((q) => q.origin === "question_paper")

	const totalQuestions = paper.questions.length
	const questionsWithMarkScheme = paper.questions.filter(
		(q) =>
			q.mark_scheme_status === "linked" ||
			q.mark_scheme_status === "auto_linked",
	).length
	const allQuestionsHaveMarkSchemes =
		totalQuestions > 0 && questionsWithMarkScheme === totalQuestions

	const hasExemplar =
		completedDocs.some((d) => d.document_type === "exemplar") ||
		paper.questions.some((q) => q.origin === "exemplar")

	const readyForSubmissions = hasQuestionPaper && allQuestionsHaveMarkSchemes

	// Split submissions into terminal (marked) and in-progress sections
	const markedSubmissions = submissions.filter((s) =>
		TERMINAL_STATUSES.has(s.status),
	)
	const inProgressSubmissions = submissions.filter(
		(s) => !TERMINAL_STATUSES.has(s.status),
	)

	const tabTriggerClass =
		"rounded-none px-4 h-full after:bg-primary data-active:text-primary data-active:bg-transparent data-active:shadow-none"

	return (
		<>
			<Tabs
				value={activeTab}
				onValueChange={(v) =>
					setActiveTab(v as "paper" | "submissions" | "analytics")
				}
				className="gap-0"
			>
				{/* Sticky frosted-glass header: title + tabs bar */}
				<div className="sticky top-0 z-10 -mx-6 -mt-6 px-6 pt-6 pb-2 backdrop-blur-xl bg-background/60 border-b">
					<div className="pb-4">
						<Link
							href="/teacher/exam-papers"
							className="text-sm text-muted-foreground hover:text-foreground"
						>
							← Back to exam papers
						</Link>
						<div className="mt-2 flex items-start justify-between gap-4">
							<div>
								<EditableTitle id={paper.id} initialTitle={paper.title} />
								<div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
									<Badge variant="secondary">{capitalize(paper.subject)}</Badge>
									{paper.exam_board && <span>{paper.exam_board}</span>}
									<span>{paper.year}</span>
									{paper.paper_number && (
										<span>Paper {paper.paper_number}</span>
									)}
									{paper.is_public ? (
										<Badge variant="default" className="gap-1">
											<Globe className="h-3 w-3" /> Public
										</Badge>
									) : (
										<Badge variant="outline" className="gap-1">
											<Lock className="h-3 w-3" /> Draft
										</Badge>
									)}
								</div>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<Button
									size="sm"
									variant="ghost"
									className="text-muted-foreground hover:text-destructive"
									onClick={() => setDeleteDialogOpen(true)}
								>
									<Trash2 className="h-3.5 w-3.5" />
									<span className="sr-only">Delete paper</span>
								</Button>
							</div>
						</div>
					</div>
					<TabsList
						variant="line"
						className="w-auto rounded-none h-10 gap-0 p-0"
					>
						<TabsTrigger value="paper" className={tabTriggerClass}>
							Paper
						</TabsTrigger>
						<TabsTrigger value="submissions" className={tabTriggerClass}>
							Submissions
							{activeBatch && (
								<span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />
							)}
							{submissions.length > 0 && (
								<span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums leading-none">
									{submissions.length}
								</span>
							)}
						</TabsTrigger>
						<TabsTrigger value="analytics" className={tabTriggerClass}>
							Analytics
						</TabsTrigger>
					</TabsList>
				</div>

				{/* ── Paper tab ── */}
				<TabsContent value="paper" className="space-y-6 mt-10">
					<Card>
						<CardContent className="pt-4 space-y-4">
							{/* Readiness strip */}
							<ReadinessStrip
								hasQuestionPaper={hasQuestionPaper}
								allQuestionsHaveMarkSchemes={allQuestionsHaveMarkSchemes}
								questionsWithMarkScheme={questionsWithMarkScheme}
								totalQuestions={totalQuestions}
								hasExemplar={hasExemplar}
							/>
							<DocumentUploadCards
								examPaperId={paper.id}
								completedDocs={completedDocs}
								activeJobs={jobs}
								onJobStarted={() =>
									void queryClient.invalidateQueries({
										queryKey: queryKeys.examPaperLiveState(paper.id),
									})
								}
							/>
						</CardContent>
					</Card>

					{/* Missing mark scheme banner */}
					{totalQuestions > 0 && !allQuestionsHaveMarkSchemes && (
						<div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm">
							<AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
							<span className="flex-1 text-destructive dark:text-red-400">
								<span className="font-medium">
									{totalQuestions - questionsWithMarkScheme} of {totalQuestions}{" "}
									{totalQuestions - questionsWithMarkScheme === 1
										? "question is"
										: "questions are"}{" "}
									missing a mark scheme.
								</span>{" "}
								Upload a mark scheme PDF or add one manually before marking.
							</span>
						</div>
					)}

					{/* Duplicate warning banner */}
					{similarPairs.length > 0 && !duplicateBannerDismissed && (
						<div className="flex items-center gap-3 rounded-lg border border-amber-400/40 bg-amber-500/5 px-3 py-2.5 text-sm">
							<AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
							<span className="flex-1 text-amber-800 dark:text-amber-200">
								{similarPairs.length} potential duplicate question
								{similarPairs.length !== 1 ? "s" : ""} detected — rows marked
								with a dot may need review. Sort by the similarity column to
								group them.
							</span>
							<button
								type="button"
								className="shrink-0 text-xs text-amber-600 hover:text-amber-900 dark:text-amber-400"
								onClick={() => setDuplicateBannerDismissed(true)}
							>
								Dismiss
							</button>
						</div>
					)}

					<UnlinkedSchemesPanel
						items={unlinkedItems}
						onLink={(item) => {
							setLinkingItem(item)
							setLinkingTargetId("")
						}}
					/>

					<ExamPaperQuestionsCard paper={paper} similarPairs={similarPairs} />

					<LevelDescriptorsCard
						examPaperId={paper.id}
						initialValue={paper.level_descriptors}
					/>
				</TabsContent>

				{/* ── Submissions tab (status banner + in-progress + marked) ── */}
				<TabsContent value="submissions" className="space-y-6 mt-10">
					{/* Compact batch status banner */}
					{activeBatch && (
						<BatchStatusBanner
							activeBatch={activeBatch}
							onReviewClick={() => setStagingOpen(true)}
						/>
					)}

					{/* In-progress jobs */}
					{inProgressSubmissions.length > 0 && (
						<>
							<SubmissionsHeader
								label="In progress"
								count={inProgressSubmissions.length}
								view={subView}
								onViewChange={setSubView}
							/>
							{subView === "grid" ? (
								<SubmissionGrid
									submissions={inProgressSubmissions}
									onView={(id) => setMarkingJobId(id)}
									onDelete={(id) =>
										queryClient.setQueryData(
											queryKeys.submissions(paper.id),
											(prev: SubmissionHistoryItem[]) =>
												prev.filter((s) => s.id !== id),
										)
									}
								/>
							) : (
								<SubmissionTable
									submissions={inProgressSubmissions}
									onView={(id) => setMarkingJobId(id)}
									onDeleteRequest={(id) =>
										queryClient.setQueryData(
											queryKeys.submissions(paper.id),
											(prev: SubmissionHistoryItem[]) =>
												prev.filter((s) => s.id !== id),
										)
									}
								/>
							)}
						</>
					)}

					{/* Marked submissions */}
					{markedSubmissions.length > 0 && (
						<>
							<SubmissionsHeader
								label="Marked"
								count={markedSubmissions.length}
								view={subView}
								onViewChange={setSubView}
							/>
							{subView === "grid" ? (
								<SubmissionGrid
									submissions={markedSubmissions}
									onView={(id) => setMarkingJobId(id)}
									onDelete={(id) =>
										queryClient.setQueryData(
											queryKeys.submissions(paper.id),
											(prev: SubmissionHistoryItem[]) =>
												prev.filter((s) => s.id !== id),
										)
									}
								/>
							) : (
								<SubmissionTable
									submissions={markedSubmissions}
									onView={(id) => setMarkingJobId(id)}
									onDeleteRequest={(id) =>
										queryClient.setQueryData(
											queryKeys.submissions(paper.id),
											(prev: SubmissionHistoryItem[]) =>
												prev.filter((s) => s.id !== id),
										)
									}
								/>
							)}
						</>
					)}

					{/* Empty state */}
					{!activeBatch && submissions.length === 0 && (
						<div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
							No submissions yet. Click &ldquo;Upload scripts&rdquo; to mark
							your first student script.
						</div>
					)}
				</TabsContent>

				{/* ── Analytics tab ── */}
				<TabsContent value="analytics" className="space-y-6 mt-10">
					<ExamPaperAnalyticsTab
						stats={analyticsStats ?? null}
						loading={analyticsLoading}
					/>
				</TabsContent>
			</Tabs>

			{/* Dialogs */}
			<LinkMarkSchemeDialog
				linkingItem={linkingItem}
				setLinkingItem={setLinkingItem}
				linkingTargetId={linkingTargetId}
				setLinkingTargetId={setLinkingTargetId}
				linkingBusy={linkingBusy}
				doLinkMarkScheme={doLinkMarkScheme}
				questions={paper.questions}
			/>

			<ConfirmDialog
				open={deleteDialogOpen}
				onOpenChange={setDeleteDialogOpen}
				title="Delete exam paper?"
				description={`This will permanently delete "${paper.title}" along with all its questions, mark schemes, and uploaded PDFs. This cannot be undone.`}
				confirmLabel="Delete paper"
				loading={deleting}
				onConfirm={() => doDeletePaper()}
			/>

			<MarkingJobDialog
				examPaperId={paper.id}
				jobId={markingJobId}
				open={markingJobId !== null}
				onOpenChange={(v) => {
					if (!v) setMarkingJobId(null)
				}}
			/>

			<StagingReviewDialog
				open={stagingOpen}
				onOpenChange={setStagingOpen}
				activeBatch={activeBatch}
				committingBatch={committingBatch}
				viewMode={stagingView}
				onViewModeChange={setStagingView}
				onCommitAll={handleCommitAll}
				onUpdateScriptName={async (id, name) => {
					await updateStagedScript(id, { confirmedName: name })
				}}
				onToggleExclude={async (id, status) => {
					await updateStagedScript(id, {
						status: status === "confirmed" ? "excluded" : "confirmed",
					})
					void refetchActiveBatch()
				}}
				onDeleteScript={() => void refetchActiveBatch()}
				onJobDeleted={() => {
					void refetchActiveBatch()
					void queryClient.invalidateQueries({
						queryKey: queryKeys.submissions(paper.id),
					})
				}}
				onViewJob={(id) => {
					setStagingOpen(false)
					void setMarkingJobId(id)
				}}
			/>

			<UploadScriptsDialog
				examPaperId={paper.id}
				open={uploadOpen}
				onOpenChange={setUploadOpen}
				onBatchStarted={() => {
					void refetchActiveBatch()
					void setActiveTab("submissions")
				}}
			/>

			{/* Floating action button */}
			<div
				className="fixed bottom-6 right-6 z-50"
				title={
					!readyForSubmissions
						? totalQuestions === 0
							? "Upload a question paper before marking"
							: `${totalQuestions - questionsWithMarkScheme} question${
									totalQuestions - questionsWithMarkScheme === 1 ? "" : "s"
								} missing a mark scheme`
						: undefined
				}
			>
				<button
					type="button"
					onClick={() => readyForSubmissions && setUploadOpen(true)}
					disabled={!readyForSubmissions}
					className="flex items-center gap-2 rounded-full bg-primary px-5 py-3.5 text-sm font-medium text-primary-foreground shadow-lg transition-all hover:bg-primary/90 hover:shadow-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<PenLine className="h-4 w-4" />
					Upload scripts
				</button>
			</div>
		</>
	)
}

// ── Readiness strip ─────────────────────────────────────────────────────────

function ReadinessStrip({
	hasQuestionPaper,
	allQuestionsHaveMarkSchemes,
	questionsWithMarkScheme,
	totalQuestions,
	hasExemplar,
}: {
	hasQuestionPaper: boolean
	allQuestionsHaveMarkSchemes: boolean
	questionsWithMarkScheme: number
	totalQuestions: number
	hasExemplar: boolean
}) {
	return (
		<div className="flex items-center gap-3 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
			<div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1">
				<ReadinessIndicator ready={hasQuestionPaper} label="Question paper" />
				<span
					className={`flex items-center gap-1.5 ${
						allQuestionsHaveMarkSchemes
							? "text-green-600 dark:text-green-400"
							: "text-amber-600 dark:text-amber-400"
					}`}
				>
					<span
						className={`h-1.5 w-1.5 shrink-0 rounded-full ${
							allQuestionsHaveMarkSchemes ? "bg-green-500" : "bg-amber-500"
						}`}
					/>
					Mark schemes
					{!allQuestionsHaveMarkSchemes && totalQuestions > 0 && (
						<span className="tabular-nums">
							({questionsWithMarkScheme}/{totalQuestions})
						</span>
					)}
				</span>
				<span className="flex items-center gap-1.5">
					<span
						className={`h-1.5 w-1.5 shrink-0 rounded-full ${
							hasExemplar ? "bg-green-500" : "bg-muted-foreground/40"
						}`}
					/>
					Exemplars (optional)
				</span>
			</div>
		</div>
	)
}

function SubmissionsHeader({
	label,
	count,
	view,
	onViewChange,
}: {
	label?: string
	count: number
	view: "grid" | "table"
	onViewChange: (v: "grid" | "table") => void
}) {
	const countLabel = `${count} script${count !== 1 ? "s" : ""}`
	return (
		<div className="flex items-center justify-between gap-4">
			<p className="text-sm font-medium text-muted-foreground">
				{label ? `${label} · ${countLabel}` : countLabel}
			</p>
			{count > 0 && <ViewToggle value={view} onChange={onViewChange} />}
		</div>
	)
}

// ── BatchStatusBanner ─────────────────────────────────────────────────────

function BatchStatusBanner({
	activeBatch,
	onReviewClick,
}: {
	activeBatch: NonNullable<ActiveBatchInfo>
	onReviewClick: () => void
}) {
	if (activeBatch.status === "classifying") {
		return (
			<div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
				<Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
				<p className="text-sm text-muted-foreground">
					Analysing upload… scripts will appear shortly.
				</p>
			</div>
		)
	}

	if (activeBatch.status === "staging") {
		const pendingCount = activeBatch.staged_scripts.filter(
			(s) => s.status !== "confirmed",
		).length
		const totalCount = activeBatch.staged_scripts.length

		return (
			<div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 px-4 py-3">
				<div className="flex items-center gap-3">
					<span className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
					<p className="text-sm">
						<span className="font-medium">
							{pendingCount > 0
								? `${pendingCount} of ${totalCount} script${totalCount !== 1 ? "s" : ""} need review`
								: `${totalCount} script${totalCount !== 1 ? "s" : ""} ready to mark`}
						</span>
						<span className="text-muted-foreground">
							{pendingCount > 0
								? " — confirm before submitting for marking"
								: " — open the review panel to start marking"}
						</span>
					</p>
				</div>
				<Button size="sm" onClick={onReviewClick}>
					Review scripts
				</Button>
			</div>
		)
	}

	if (activeBatch.status === "marking") {
		const completedCount = activeBatch.student_jobs.filter(
			(j) => j.status === "ocr_complete",
		).length
		const total = activeBatch.total_student_jobs
		const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0

		const unsubmittedCount = activeBatch.staged_scripts.filter((s) => {
			const submittedIds = new Set(
				activeBatch.student_jobs.map((j) => j.staged_script_id),
			)
			return !submittedIds.has(s.id)
		}).length

		return (
			<div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-2">
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
						<p className="text-sm font-medium">
							Marking · {completedCount} of {total} scripts done
						</p>
					</div>
					<div className="flex items-center gap-3">
						<span className="text-sm text-muted-foreground tabular-nums">
							{percent}%
						</span>
						{unsubmittedCount > 0 && (
							<Button size="sm" variant="outline" onClick={onReviewClick}>
								{unsubmittedCount} more to review
							</Button>
						)}
					</div>
				</div>
				<div className="h-1.5 rounded-full bg-muted overflow-hidden">
					<div
						className="h-full rounded-full bg-primary transition-all duration-500"
						style={{ width: `${percent}%` }}
					/>
				</div>
			</div>
		)
	}

	return null
}

function ReadinessIndicator({
	ready,
	label,
}: {
	ready: boolean
	label: string
}) {
	return (
		<span
			className={`flex items-center gap-1.5 ${
				ready
					? "text-green-600 dark:text-green-400"
					: "text-amber-600 dark:text-amber-400"
			}`}
		>
			<span
				className={`h-1.5 w-1.5 shrink-0 rounded-full ${
					ready ? "bg-green-500" : "bg-amber-500"
				}`}
			/>
			{label}
		</span>
	)
}

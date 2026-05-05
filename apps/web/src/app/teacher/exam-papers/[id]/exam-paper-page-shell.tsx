"use client"

import { ShareDialog } from "@/components/sharing/share-dialog"
import { usePageTitle } from "@/components/teacher/teacher-page-title-context"
import { Badge } from "@/components/ui/badge"
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Currency } from "@/lib/billing/types"
import { deleteExamPaper } from "@/lib/exam-paper/paper/mutations"
import type {
	ExamPaperDetail,
	UnlinkedMarkScheme,
} from "@/lib/exam-paper/types"
import type { ExamPaperStats, SubmissionHistoryItem } from "@/lib/marking/types"
import type {
	ActiveExamPaperIngestionJob,
	PdfDocument,
} from "@/lib/pdf-ingestion/queries"
import { queryKeys } from "@/lib/query-keys"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
	AlertTriangle,
	BookText,
	MoreVertical,
	Pencil,
	Share2,
	Trash2,
	Upload,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { parseAsString, parseAsStringEnum, useQueryState } from "nuqs"
import { useState } from "react"
import { toast } from "sonner"
import { CapBiteModal } from "./cap-bite-modal"
import { DocumentThumbnail } from "./document-thumbnail"
import { EditableTitle } from "./editable-title"
import { ExamPaperAnalyticsTab } from "./exam-paper-analytics-tab"
import { capitalize } from "./exam-paper-helpers"
import { ExamPaperQuestionsCard } from "./exam-paper-questions-card"
import { useBatchIngestion } from "./hooks/use-batch-ingestion"
import { useExamPaperLiveQueries } from "./hooks/use-exam-paper-live-queries"
import { useLinkMarkScheme } from "./hooks/use-exam-paper-mutations"
import { useSimilarQuestions } from "./hooks/use-similar-questions"
import { useSubmissions } from "./hooks/use-submissions"
import { useSwMessages } from "./hooks/use-sw-messages"
import { useUnlinkedSchemes } from "./hooks/use-unlinked-schemes"
import { LevelDescriptorsDialog } from "./level-descriptors-dialog"
import { LinkMarkSchemeDialog } from "./link-mark-scheme-dialog"
import { MarkingGuidanceButton } from "./marking-guidance-button"
import { MarkingJobDialog } from "./marking-job-dialog"
import { UnifiedQuestionDialog } from "./questions/[question_id]/unified-question-dialog"
import { RenameExamPaperDialog } from "./rename-exam-paper-dialog"
import { StagingReviewDialog } from "./staging-review-dialog"
import { SubmissionsTabContent } from "./submissions-tab-content"
import { UnlinkedSchemesPanel } from "./unlinked-schemes-panel"
import { UploadScriptsDialog } from "./upload-scripts-dialog"

export function ExamPaperPageShell({
	paper: initialPaper,
	initialLiveState = { ok: true as const, jobs: [], documents: [] },
	initialSubmissions = [],
	initialAnalytics = null,
	currency,
	topUpPriceLabel,
	topUpPapers,
}: {
	paper: ExamPaperDetail
	initialLiveState?: {
		ok: true
		jobs: ActiveExamPaperIngestionJob[]
		documents: PdfDocument[]
	}
	initialSubmissions?: SubmissionHistoryItem[]
	initialAnalytics?: ExamPaperStats | null
	currency: Currency
	topUpPriceLabel: string
	topUpPapers: number
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
	const [, setQuestionParam] = useQueryState("question", parseAsString)
	const [editQuestionId, setEditQuestionId] = useQueryState(
		"edit_question",
		parseAsString,
	)

	// Cap-bite modal — surfaced when commitBatch fails because the user
	// can't cover the staged scripts. Replaces the generic upgrade toast for
	// the batch path so the user can resolve the gate inline.
	const [capBiteMessage, setCapBiteMessage] = useState<string | null>(null)

	// Batch ingestion (classifying, staging) — independent of submissions
	const {
		ingestion,
		refetchIngestion,
		committingBatch,
		handleCommitAll,
		handleSplitScript,
		handleAddScript,
		handleUpdateScriptName,
		handleToggleExclude,
		handleToggleIncludeAll,
	} = useBatchIngestion(paper.id, {
		onCapBite: (message) => setCapBiteMessage(message),
	})

	// Submissions — flat list, 60s poll + SW-triggered refresh
	const {
		submissions,
		markedCount,
		inProgressCount,
		refetch: refetchSubmissions,
		isFetching: isRefreshingSubmissions,
	} = useSubmissions({
		paperId: paper.id,
		initialSubmissions,
	})

	// Instant refresh when service worker receives batch-complete push
	useSwMessages(paper.id)

	// Delete exam paper
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

	// Mobile-driven dialog state — the ⋯ menu on mobile triggers these. The
	// desktop action cluster has its own self-contained triggers.
	const [renameOpen, setRenameOpen] = useState(false)
	const [shareOpenMobile, setShareOpenMobile] = useState(false)
	const [markingGuidanceOpenMobile, setMarkingGuidanceOpenMobile] =
		useState(false)
	const { mutate: doDeletePaper, isPending: deleting } = useMutation({
		mutationFn: () => deleteExamPaper({ id: paper.id }),
		onMutate: () => setDeleteDialogOpen(false),
		onSuccess: (result) => {
			if (result?.serverError) {
				toast.error(result.serverError)
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
	const allQuestions = paper.sections.flatMap((s) => s.questions)

	const questionPaperDoc = completedDocs.find(
		(d) => d.document_type === "question_paper",
	)
	const hasQuestionPaper =
		!!questionPaperDoc ||
		allQuestions.some((q) => q.origin === "question_paper")

	const totalQuestions = allQuestions.length
	const questionsWithMarkScheme = allQuestions.filter(
		(q) =>
			q.mark_scheme_status === "linked" ||
			q.mark_scheme_status === "auto_linked",
	).length
	const allQuestionsHaveMarkSchemes =
		totalQuestions > 0 && questionsWithMarkScheme === totalQuestions

	const readyForSubmissions = hasQuestionPaper && allQuestionsHaveMarkSchemes
	const stagedCount = ingestion?.isReadyForReview
		? ingestion.allScripts.length
		: 0

	const tabTriggerClass =
		"rounded-none px-4 h-full after:bg-primary data-active:text-primary data-active:bg-transparent data-active:shadow-none"

	// Drives the persistent mobile app bar — paper title stays visible at the
	// top of the viewport even after the user scrolls past the inline hero.
	usePageTitle(paper.title)

	// Shared action cluster — rendered in both the desktop sticky header and
	// the mobile flat header. Each Popover/Dialog/Tooltip carries its own
	// state so the duplicate trees don't collide; only one is visible at a
	// time (md:hidden vs hidden md:block).
	function renderActions() {
		return (
			<div className="flex shrink-0 items-center gap-1">
				<MarkingGuidanceButton
					examPaperId={paper.id}
					initialValue={paper.level_descriptors}
				/>
				{similarPairs.length > 0 && !duplicateBannerDismissed && (
					<Popover>
						<PopoverTrigger
							render={
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="text-warning hover:text-warning"
								>
									<AlertTriangle className="h-3.5 w-3.5" />
									<span className="sr-only">
										{similarPairs.length} potential duplicate
										{similarPairs.length !== 1 ? "s" : ""}
									</span>
								</Button>
							}
						/>
						<PopoverContent className="w-72 text-xs">
							<p className="text-warning-800 dark:text-warning-200">
								<span className="font-medium">
									{similarPairs.length} potential duplicate question
									{similarPairs.length !== 1 ? "s" : ""}
								</span>{" "}
								detected. Rows marked with a dot may need review — sort by the
								similarity column to group them.
							</p>
							<Button
								variant="ghost"
								size="xs"
								className="mt-2 -ml-2 text-muted-foreground hover:text-foreground"
								onClick={() => setDuplicateBannerDismissed(true)}
							>
								Dismiss
							</Button>
						</PopoverContent>
					</Popover>
				)}
				<ShareDialog
					resourceType="exam_paper"
					resourceId={paper.id}
					trigger={
						<Button
							type="button"
							size="sm"
							variant="ghost"
							className="gap-1.5 text-muted-foreground hover:text-foreground"
							aria-label="Share paper"
						>
							<Share2 className="h-3.5 w-3.5" />
							<span className="hidden sm:inline">Share</span>
						</Button>
					}
				/>
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									type="button"
									size="sm"
									variant="ghost"
									className="text-muted-foreground hover:text-destructive"
									onClick={() => setDeleteDialogOpen(true)}
								>
									<Trash2 className="h-3.5 w-3.5" />
									<span className="sr-only">Delete paper</span>
								</Button>
							}
						/>
						<TooltipContent>Delete paper</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>
		)
	}

	// Mobile-only ⋯ menu. Collapses the desktop action cluster (Marking
	// guidance, Share, Rename, Delete) into a single discoverable affordance.
	// Each item flips state that drives a controlled dialog rendered at the
	// shell level (see RenameExamPaperDialog, LevelDescriptorsDialog,
	// ShareDialog instances below).
	function renderMobileMenu() {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							type="button"
							size="sm"
							variant="ghost"
							className="text-muted-foreground hover:text-foreground"
							aria-label="More actions"
						>
							<MoreVertical className="h-4 w-4" />
						</Button>
					}
				/>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuItem onSelect={() => setMarkingGuidanceOpenMobile(true)}>
						<BookText className="h-3.5 w-3.5" />
						Marking guidance
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => setShareOpenMobile(true)}>
						<Share2 className="h-3.5 w-3.5" />
						Share
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => setRenameOpen(true)}>
						<Pencil className="h-3.5 w-3.5" />
						Rename
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onSelect={() => setDeleteDialogOpen(true)}
						variant="destructive"
					>
						<Trash2 className="h-3.5 w-3.5" />
						Delete paper
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		)
	}

	function renderTabs() {
		return (
			<TabsList variant="line" className="w-auto rounded-none h-10 gap-0 p-0">
				<TabsTrigger value="paper" className={tabTriggerClass}>
					Paper
				</TabsTrigger>
				<TabsTrigger value="submissions" className={tabTriggerClass}>
					Submissions
					{stagedCount > 0 ? (
						<AlertTriangle
							className="ml-1.5 h-3.5 w-3.5 shrink-0 text-warning"
							aria-label={`${stagedCount} staged ${stagedCount === 1 ? "script" : "scripts"} not yet sent for marking`}
						/>
					) : ingestion?.isProcessing ? (
						<span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />
					) : null}
				</TabsTrigger>
				<TabsTrigger value="analytics" className={tabTriggerClass}>
					Analytics
				</TabsTrigger>
			</TabsList>
		)
	}

	// Sticky header shrink-on-scroll is driven entirely by CSS scroll-driven
	// animations (animation-timeline: scroll(nearest)) — see `.exam-hdr*`
	// classes in globals.css. No JS, no React state, no scroll listener;
	// the browser ties animation progress directly to scroll position of
	// the nearest scrollable ancestor. Browsers without animation-timeline
	// support fall through to the keyframe `from` state (the static full
	// header) via @supports.

	return (
		<>
			<Tabs
				value={activeTab}
				onValueChange={(v) =>
					setActiveTab(v as "paper" | "submissions" | "analytics")
				}
				className="gap-0"
			>
				{/* Mobile flat header — full-size thumbnails, plain wrapping title,
				    a single ⋯ menu instead of a cramped icon cluster. Whole page
				    scrolls naturally; tabs are part of the scroll flow. The
				    persistent app bar above keeps the title visible after the
				    user scrolls past this hero. */}
				<div className="md:hidden">
					{/* Badges + ⋯ menu — menu sits at the natural top-right slot */}
					<div className="mb-4 flex items-start justify-between gap-3">
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
							<Badge variant="secondary">{capitalize(paper.subject)}</Badge>
							{paper.exam_board && <span>{paper.exam_board}</span>}
							<span>{paper.year}</span>
							{paper.paper_number && <span>Paper {paper.paper_number}</span>}
						</div>
						{renderMobileMenu()}
					</div>

					<div className="mb-4 flex items-start gap-3">
						<div
							className="shrink-0 overflow-hidden"
							style={{ width: "136px", height: "192px" }}
						>
							<DocumentThumbnail
								examPaperId={paper.id}
								documentType="question_paper"
								completedDoc={questionPaperDoc ?? null}
								activeJob={
									jobs.find((j) => j.document_type === "question_paper") ?? null
								}
								onJobStarted={() =>
									void queryClient.invalidateQueries({
										queryKey: queryKeys.examPaperLiveState(paper.id),
									})
								}
								size="compact"
								thumbnailClassName="h-full w-full"
							/>
						</div>
						<div
							className="shrink-0 overflow-hidden"
							style={{ width: "136px", height: "192px" }}
						>
							<DocumentThumbnail
								examPaperId={paper.id}
								documentType="mark_scheme"
								completedDoc={
									completedDocs.find(
										(d) => d.document_type === "mark_scheme",
									) ?? null
								}
								activeJob={
									jobs.find((j) => j.document_type === "mark_scheme") ?? null
								}
								onJobStarted={() =>
									void queryClient.invalidateQueries({
										queryKey: queryKeys.examPaperLiveState(paper.id),
									})
								}
								size="compact"
								thumbnailClassName="h-full w-full"
							/>
						</div>
					</div>

					{/* Plain title — wraps freely. Editing happens via the ⋯ menu. */}
					<h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground break-words">
						{paper.title}
					</h1>

					{/* Inline duplicates alert — state, not action. Click expands
					    the same Popover content the desktop toolbar uses. */}
					{similarPairs.length > 0 && !duplicateBannerDismissed && (
						<Popover>
							<PopoverTrigger
								render={
									<button
										type="button"
										className="mt-3 flex w-full items-center gap-2 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-left text-xs text-warning-800 transition-colors hover:bg-warning-100 dark:border-warning-900 dark:bg-warning-950/30 dark:text-warning-200 dark:hover:bg-warning-950/50"
									>
										<AlertTriangle className="size-4 shrink-0 text-warning" />
										<span className="font-medium">
											{similarPairs.length} potential duplicate
											{similarPairs.length !== 1 ? "s" : ""}
										</span>
										<span className="ml-auto text-warning-700/70 dark:text-warning-300/70">
											Review
										</span>
									</button>
								}
							/>
							<PopoverContent className="w-72 text-xs">
								<p className="text-warning-800 dark:text-warning-200">
									<span className="font-medium">
										{similarPairs.length} potential duplicate question
										{similarPairs.length !== 1 ? "s" : ""}
									</span>{" "}
									detected. Rows marked with a dot may need review — sort by the
									similarity column to group them.
								</p>
								<Button
									variant="ghost"
									size="xs"
									className="mt-2 -ml-2 text-muted-foreground hover:text-foreground"
									onClick={() => setDuplicateBannerDismissed(true)}
								>
									Dismiss
								</Button>
							</PopoverContent>
						</Popover>
					)}

					<div className="mt-4 -mx-4 border-b px-4">{renderTabs()}</div>
				</div>

				{/* Desktop sticky header — solid bg, shrinks via CSS scroll-driven
				    animation. Hidden on mobile (replaced by the flat block above). */}
				<div className="exam-hdr sticky top-0 z-20 -mx-6 hidden border-b bg-background px-6 pt-3 pb-2 md:block">
					{/* Breadcrumb — collapses to zero on scroll. Desktop-only; the
					    mobile app bar's title is the navigation cue on small screens. */}
					<div className="exam-hdr-collapse max-h-10 overflow-hidden pb-2 opacity-100">
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem>
									<BreadcrumbLink render={<Link href="/teacher/exam-papers" />}>
										Exam papers
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage className="line-clamp-1">
										{paper.title}
									</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					<div className="exam-hdr-row mt-1 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 pb-2">
						<div className="exam-hdr-row-inner flex min-w-0 flex-1 items-start gap-4">
							<div className="exam-hdr-thumb-stack flex shrink-0 items-start gap-2">
								<div
									className="exam-hdr-thumb shrink-0 overflow-hidden"
									style={{ width: "136px", height: "192px" }}
								>
									<DocumentThumbnail
										examPaperId={paper.id}
										documentType="question_paper"
										completedDoc={questionPaperDoc ?? null}
										activeJob={
											jobs.find((j) => j.document_type === "question_paper") ??
											null
										}
										onJobStarted={() =>
											void queryClient.invalidateQueries({
												queryKey: queryKeys.examPaperLiveState(paper.id),
											})
										}
										size="compact"
										thumbnailClassName="h-full w-full"
									/>
								</div>
								<div
									className="exam-hdr-thumb shrink-0 overflow-hidden"
									style={{ width: "136px", height: "192px" }}
								>
									<DocumentThumbnail
										examPaperId={paper.id}
										documentType="mark_scheme"
										completedDoc={
											completedDocs.find(
												(d) => d.document_type === "mark_scheme",
											) ?? null
										}
										activeJob={
											jobs.find((j) => j.document_type === "mark_scheme") ??
											null
										}
										onJobStarted={() =>
											void queryClient.invalidateQueries({
												queryKey: queryKeys.examPaperLiveState(paper.id),
											})
										}
										size="compact"
										thumbnailClassName="h-full w-full"
									/>
								</div>
							</div>
							<div className="min-w-0 flex-1">
								<EditableTitle id={paper.id} initialTitle={paper.title} />
								{/* Subtitle badges — collapse on scroll */}
								<div className="exam-hdr-collapse mt-1 flex max-h-10 flex-wrap items-center gap-2 overflow-hidden text-sm text-muted-foreground opacity-100">
									<Badge variant="secondary">{capitalize(paper.subject)}</Badge>
									{paper.exam_board && <span>{paper.exam_board}</span>}
									<span>{paper.year}</span>
									{paper.paper_number && (
										<span>Paper {paper.paper_number}</span>
									)}
								</div>
							</div>
						</div>
						<div className="ml-auto">{renderActions()}</div>
					</div>

					{renderTabs()}
				</div>

				{/* ── Paper tab ── */}
				<TabsContent value="paper" className="space-y-6 mt-4 md:mt-10">
					{/* Missing mark scheme banner */}
					{totalQuestions > 0 && !allQuestionsHaveMarkSchemes && (
						<div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm">
							<AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
							<span className="flex-1 text-destructive dark:text-error-400">
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

					<UnlinkedSchemesPanel
						items={unlinkedItems}
						onLink={(item) => {
							setLinkingItem(item)
							setLinkingTargetId("")
						}}
					/>

					<ExamPaperQuestionsCard paper={paper} similarPairs={similarPairs} />
				</TabsContent>

				{/* ── Submissions tab ── */}
				<TabsContent value="submissions" className="space-y-6 mt-4 md:mt-10">
					<SubmissionsTabContent
						paperId={paper.id}
						ingestion={ingestion}
						submissions={submissions}
						markedCount={markedCount}
						inProgressCount={inProgressCount}
						onOpenStaging={() => setStagingOpen(true)}
						onViewJob={(id) => setMarkingJobId(id)}
						onDeleteSubmission={(id) =>
							queryClient.setQueryData(
								queryKeys.submissions(paper.id),
								(prev: SubmissionHistoryItem[]) =>
									prev.filter((s) => s.id !== id),
							)
						}
						onRefresh={() => void refetchSubmissions()}
						isRefreshing={isRefreshingSubmissions}
					/>
				</TabsContent>

				{/* ── Analytics tab ── */}
				<TabsContent value="analytics" className="space-y-6 mt-4 md:mt-10">
					<ExamPaperAnalyticsTab
						stats={analyticsStats ?? null}
						loading={analyticsLoading}
						submissions={submissions}
						boundaries={paper.grade_boundaries}
						boundaryMode={paper.grade_boundary_mode}
						paperTotal={paper.total_marks}
					/>
				</TabsContent>
			</Tabs>

			{/* Dialogs */}
			{/* Controlled by the mobile ⋯ menu (Marking guidance / Share /
			    Rename). The desktop action cluster has its own self-contained
			    triggers, so these instances only fire on mobile. */}
			<RenameExamPaperDialog
				id={paper.id}
				currentTitle={paper.title}
				open={renameOpen}
				onOpenChange={setRenameOpen}
			/>
			<LevelDescriptorsDialog
				examPaperId={paper.id}
				initialValue={paper.level_descriptors}
				open={markingGuidanceOpenMobile}
				onOpenChange={setMarkingGuidanceOpenMobile}
				onSaved={() =>
					void queryClient.invalidateQueries({
						queryKey: queryKeys.examPaper(paper.id),
					})
				}
			/>
			<ShareDialog
				resourceType="exam_paper"
				resourceId={paper.id}
				open={shareOpenMobile}
				onOpenChange={setShareOpenMobile}
			/>

			<LinkMarkSchemeDialog
				linkingItem={linkingItem}
				setLinkingItem={setLinkingItem}
				linkingTargetId={linkingTargetId}
				setLinkingTargetId={setLinkingTargetId}
				linkingBusy={linkingBusy}
				doLinkMarkScheme={doLinkMarkScheme}
				questions={allQuestions}
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
					if (!v) {
						void setMarkingJobId(null)
						void setQuestionParam(null)
					}
				}}
				onJobChange={(newJobId) => void setMarkingJobId(newJobId)}
			/>

			<CapBiteModal
				open={capBiteMessage !== null}
				onOpenChange={(open) => {
					if (!open) setCapBiteMessage(null)
				}}
				message={capBiteMessage ?? ""}
				currency={currency}
				topUpPriceLabel={topUpPriceLabel}
				topUpPapers={topUpPapers}
				returnPath={`/teacher/exam-papers/${paper.id}`}
			/>

			{(() => {
				const editQuestion = editQuestionId
					? allQuestions.find((q) => q.id === editQuestionId)
					: null
				return (
					<UnifiedQuestionDialog
						question={editQuestion ?? null}
						paperId={paper.id}
						open={editQuestion !== null}
						onOpenChange={(v) => {
							if (!v) void setEditQuestionId(null)
						}}
					/>
				)
			})()}

			<StagingReviewDialog
				open={stagingOpen}
				onOpenChange={setStagingOpen}
				ingestion={ingestion}
				committingBatch={committingBatch}
				onCommitAll={handleCommitAll}
				onUpdateScriptName={handleUpdateScriptName}
				onToggleExclude={handleToggleExclude}
				onToggleIncludeAll={handleToggleIncludeAll}
				onSplitScript={handleSplitScript}
				onDeleteScript={() => {}}
				onAddScript={handleAddScript}
			/>

			<UploadScriptsDialog
				examPaperId={paper.id}
				open={uploadOpen}
				onOpenChange={setUploadOpen}
				onBatchStarted={() => {
					void refetchIngestion()
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
				<Button
					onClick={() => readyForSubmissions && setUploadOpen(true)}
					disabled={!readyForSubmissions}
					aria-label="Upload scripts"
					className="h-[75px] w-[75px] rounded-full p-0 shadow-lg hover:shadow-sm active:scale-95"
				>
					<Upload className="size-8" />
				</Button>
			</div>
		</>
	)
}

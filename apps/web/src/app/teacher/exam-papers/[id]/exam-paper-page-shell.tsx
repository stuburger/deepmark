"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import type { ExamPaperDetail, SimilarPair } from "@/lib/dashboard-actions"
import {
	deleteExamPaper,
	getSimilarQuestionsForPaper,
} from "@/lib/dashboard-actions"
import { getActiveIngestionJobsForExamPaper } from "@/lib/pdf-ingestion-actions"
import {
	AlertCircle,
	AlertTriangle,
	ArrowUpDown,
	BookOpen,
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	Clock,
	FileText,
	Globe,
	Lock,
	Trash2,
	Upload,
	XCircle,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { EditableTitle } from "./editable-title"
import { PdfDocumentsPanel } from "./pdf-preview-dialog"
import { UploadPdfDrawer } from "./upload-pdf-drawer"

type IngestionJob = {
	id: string
	document_type: string
	status: string
	error: string | null
}

const TERMINAL = new Set(["ocr_complete", "failed", "cancelled"])
const POLL_MS = 3000

type SortKey = "number" | "marks" | "similarity"
type SortDir = "asc" | "desc"

/**
 * Natural-sort comparison for question numbers like "1a", "2bii", "10".
 * Numbers within the string are compared numerically; letters lexicographically.
 */
function naturalCompare(a: string | null, b: string | null): number {
	if (a === null && b === null) return 0
	if (a === null) return 1
	if (b === null) return -1
	const re = /(\d+)|(\D+)/g
	const partsA = [...a.matchAll(re)].map((m) => m[0])
	const partsB = [...b.matchAll(re)].map((m) => m[0])
	for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
		const pa = partsA[i] ?? ""
		const pb = partsB[i] ?? ""
		const na = Number(pa)
		const nb = Number(pb)
		if (!isNaN(na) && !isNaN(nb)) {
			if (na !== nb) return na - nb
		} else {
			if (pa < pb) return -1
			if (pa > pb) return 1
		}
	}
	return 0
}

const DOC_TYPE_LABELS: Record<string, string> = {
	mark_scheme: "Mark scheme",
	question_paper: "Question paper",
	exemplar: "Exemplar",
	student_paper: "Student paper",
}

function docTypeLabel(type: string): string {
	return DOC_TYPE_LABELS[type] ?? type
}

function jobStatusLabel(status: string): string {
	switch (status) {
		case "pending":
			return "Queued"
		case "processing":
			return "Reading PDF"
		case "extracting":
			return "Extracting data"
		case "extracted":
			return "Finalising"
		case "ocr_complete":
			return "Complete"
		case "failed":
			return "Failed"
		case "cancelled":
			return "Cancelled"
		default:
			return status
	}
}

function schemeBadge(status: string | null) {
	if (!status) return <Badge variant="outline">No scheme</Badge>
	switch (status) {
		case "linked":
		case "auto_linked":
			return <Badge variant="secondary">Has scheme</Badge>
		case "unlinked":
			return <Badge variant="destructive">Unlinked</Badge>
		default:
			return <Badge variant="outline">{status}</Badge>
	}
}

function originBadgeVariant(origin: string) {
	switch (origin) {
		case "question_paper":
			return "default" as const
		case "mark_scheme":
			return "secondary" as const
		default:
			return "outline" as const
	}
}

function originLabel(origin: string) {
	switch (origin) {
		case "question_paper":
			return "Question Paper"
		case "mark_scheme":
			return "Mark Scheme"
		case "exemplar":
			return "Exemplar"
		case "manual":
			return "Manual"
		default:
			return origin
	}
}

function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1)
}

export function ExamPaperPageShell({
	paper,
	togglePublicForm,
}: {
	paper: ExamPaperDetail
	togglePublicForm: ReactNode
}) {
	const router = useRouter()

	const [drawerOpen, setDrawerOpen] = useState(false)
	const [trackingJob, setTrackingJob] = useState<IngestionJob | null>(null)

	const [jobs, setJobs] = useState<IngestionJob[]>([])
	const prevJobStatuses = useRef<Record<string, string>>({})

	// Similarity / duplicate detection
	const [similarPairs, setSimilarPairs] = useState<SimilarPair[]>([])
	const [duplicateBannerDismissed, setDuplicateBannerDismissed] =
		useState(false)

	// Delete
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const [deleteError, setDeleteError] = useState<string | null>(null)

	// Sort state
	const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
		key: "number",
		dir: "asc",
	})

	const fetchJobs = useCallback(async () => {
		const r = await getActiveIngestionJobsForExamPaper(paper.id)
		if (r.ok) setJobs(r.jobs)
	}, [paper.id])

	useEffect(() => {
		void fetchJobs()
	}, [fetchJobs])

	useEffect(() => {
		const id = setInterval(() => void fetchJobs(), POLL_MS)
		return () => clearInterval(id)
	}, [fetchJobs])

	useEffect(() => {
		if (!trackingJob) return
		const updated = jobs.find((j) => j.id === trackingJob.id)
		if (updated && updated.status !== trackingJob.status) {
			setTrackingJob(updated)
		}
	}, [jobs, trackingJob])

	useEffect(() => {
		let shouldRefresh = false
		for (const job of jobs) {
			const prev = prevJobStatuses.current[job.id]
			// Refresh as soon as any job completes or fails — don't wait for all
			if (
				prev !== undefined &&
				prev !== job.status &&
				TERMINAL.has(job.status)
			) {
				shouldRefresh = true
			}
			prevJobStatuses.current[job.id] = job.status
		}
		if (shouldRefresh) router.refresh()
	}, [jobs, router])

	// Load similarity pairs once on mount (lazy, non-blocking)
	useEffect(() => {
		getSimilarQuestionsForPaper(paper.id).then((r) => {
			if (r.ok) setSimilarPairs(r.pairs)
		})
	}, [paper.id])

	function toggleSort(key: SortKey) {
		setSort((prev) =>
			prev.key === key
				? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
				: { key, dir: "asc" },
		)
	}

	async function handleDelete() {
		setDeleting(true)
		setDeleteError(null)
		const result = await deleteExamPaper(paper.id)
		setDeleting(false)
		if (!result.ok) {
			setDeleteError(result.error)
			return
		}
		router.push("/teacher/exam-papers")
	}

	function openForUpload() {
		setTrackingJob(null)
		setDrawerOpen(true)
	}

	function openForTracking(job: IngestionJob) {
		setTrackingJob(job)
		setDrawerOpen(true)
	}

	const activeJobs = jobs.filter((j) => !TERMINAL.has(j.status))
	const recentTerminalJobs = jobs.filter((j) => TERMINAL.has(j.status))

	// Build a set of question IDs that have at least one similar pair
	const duplicateIds = new Set(
		similarPairs.flatMap((p) => [p.questionId, p.similarToId]),
	)

	// Sort questions client-side
	const sortedQuestions = [...paper.questions].sort((a, b) => {
		let cmp = 0
		if (sort.key === "number") {
			cmp = naturalCompare(a.question_number, b.question_number)
			if (cmp === 0) cmp = a.order - b.order
		} else if (sort.key === "marks") {
			const pa = a.points ?? -1
			const pb = b.points ?? -1
			cmp = pa - pb
		} else if (sort.key === "similarity") {
			// Duplicates first (group them), then by question number
			const aDup = duplicateIds.has(a.id) ? 0 : 1
			const bDup = duplicateIds.has(b.id) ? 0 : 1
			cmp = aDup - bDup
			if (cmp === 0) {
				// Within duplicates, group actual pairs together
				const aPairId =
					similarPairs.find(
						(p) => p.questionId === a.id || p.similarToId === a.id,
					)?.questionId ?? ""
				const bPairId =
					similarPairs.find(
						(p) => p.questionId === b.id || p.similarToId === b.id,
					)?.questionId ?? ""
				cmp = aPairId.localeCompare(bPairId)
			}
			if (cmp === 0) cmp = naturalCompare(a.question_number, b.question_number)
		}
		return sort.dir === "asc" ? cmp : -cmp
	})

	return (
		<>
			{/* Header */}
			<div>
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
							{paper.paper_number && <span>Paper {paper.paper_number}</span>}
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
						{togglePublicForm}
						<Button size="sm" onClick={openForUpload}>
							<Upload className="h-3.5 w-3.5 mr-1.5" />
							Upload PDF
						</Button>
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

			{/* Stats */}
			<div className="grid grid-cols-3 gap-4">
				<Card>
					<CardContent className="pt-4 flex items-center gap-3">
						<FileText className="h-5 w-5 text-muted-foreground" />
						<div>
							<p className="text-2xl font-bold">{paper.questions.length}</p>
							<p className="text-xs text-muted-foreground">Questions</p>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4 flex items-center gap-3">
						<BookOpen className="h-5 w-5 text-muted-foreground" />
						<div>
							<p className="text-2xl font-bold">{paper.total_marks}</p>
							<p className="text-xs text-muted-foreground">Total marks</p>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4 flex items-center gap-3">
						<Clock className="h-5 w-5 text-muted-foreground" />
						<div>
							<p className="text-2xl font-bold">{paper.duration_minutes}</p>
							<p className="text-xs text-muted-foreground">Minutes</p>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Per-job progress banners */}
			{(activeJobs.length > 0 || recentTerminalJobs.length > 0) && (
				<div className="space-y-2">
					{[...activeJobs, ...recentTerminalJobs].map((job) => {
						const isActive = !TERMINAL.has(job.status)
						const isFailed = job.status === "failed"
						const isCancelled = job.status === "cancelled"
						const isComplete = job.status === "ocr_complete"
						return (
							<div
								key={job.id}
								className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
									isFailed
										? "border-destructive/40 bg-destructive/5"
										: isComplete
											? "border-green-500/30 bg-green-500/5"
											: isCancelled
												? "bg-muted/30"
												: "bg-muted/30"
								}`}
							>
								{isActive && <Spinner className="h-4 w-4 shrink-0" />}
								{isFailed && (
									<AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
								)}
								{isComplete && (
									<CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
								)}
								{isCancelled && (
									<XCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
								)}
								<span
									className={`font-medium ${isFailed ? "text-destructive" : "text-foreground"}`}
								>
									{docTypeLabel(job.document_type)}
								</span>
								<span className="text-muted-foreground">
									{jobStatusLabel(job.status)}
									{isFailed && job.error && ` — ${job.error}`}
								</span>
								<Button
									variant="link"
									className="ml-auto h-auto p-0 text-sm"
									onClick={() => openForTracking(job)}
								>
									{isFailed ? "Retry" : isComplete ? "View" : "View progress"}
								</Button>
							</div>
						)
					})}
				</div>
			)}

			{/* PDF documents panel */}
			<PdfDocumentsPanel examPaperId={paper.id} />

			{/* Duplicate warning banner */}
			{similarPairs.length > 0 && !duplicateBannerDismissed && (
				<div className="flex items-center gap-3 rounded-lg border border-amber-400/40 bg-amber-500/5 px-3 py-2.5 text-sm">
					<AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
					<span className="flex-1 text-amber-800 dark:text-amber-200">
						{similarPairs.length} potential duplicate question
						{similarPairs.length !== 1 ? "s" : ""} detected — rows marked with a
						dot may need review.{" "}
						<button
							type="button"
							className="underline underline-offset-2"
							onClick={() => setSort({ key: "similarity", dir: "asc" })}
						>
							Sort by similarity
						</button>{" "}
						to group them.
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

			{/* Questions table */}
			<Card>
				<CardHeader>
					<CardTitle>Questions</CardTitle>
					<CardDescription>
						{paper.section_count} section
						{paper.section_count !== 1 ? "s" : ""} · {paper.questions.length}{" "}
						question
						{paper.questions.length !== 1 ? "s" : ""} · click a row to view the
						full question and mark scheme
					</CardDescription>
				</CardHeader>
				<CardContent>
					{paper.questions.length === 0 ? (
						<div className="py-8 text-center text-sm text-muted-foreground">
							No questions yet. Upload a question paper or mark scheme PDF to
							populate this paper.
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-16">
										<button
											type="button"
											className="flex items-center gap-1 text-xs font-medium hover:text-foreground"
											onClick={() => toggleSort("number")}
										>
											#
											{sort.key === "number" ? (
												sort.dir === "asc" ? (
													<ChevronUp className="h-3 w-3" />
												) : (
													<ChevronDown className="h-3 w-3" />
												)
											) : (
												<ArrowUpDown className="h-3 w-3 opacity-40" />
											)}
										</button>
									</TableHead>
									<TableHead>Section</TableHead>
									<TableHead>Question</TableHead>
									<TableHead>Source</TableHead>
									<TableHead>
										<button
											type="button"
											className="flex items-center gap-1 text-xs font-medium hover:text-foreground"
											onClick={() => toggleSort("marks")}
										>
											Marks
											{sort.key === "marks" ? (
												sort.dir === "asc" ? (
													<ChevronUp className="h-3 w-3" />
												) : (
													<ChevronDown className="h-3 w-3" />
												)
											) : (
												<ArrowUpDown className="h-3 w-3 opacity-40" />
											)}
										</button>
									</TableHead>
									<TableHead>Mark scheme</TableHead>
									<TableHead className="w-8">
										<button
											type="button"
											className="flex items-center gap-1 text-xs font-medium hover:text-foreground"
											onClick={() => toggleSort("similarity")}
											title="Sort by similarity to group potential duplicates"
										>
											<ArrowUpDown
												className={`h-3 w-3 ${sort.key === "similarity" ? "" : "opacity-40"}`}
											/>
										</button>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{sortedQuestions.map((q) => {
									const isDuplicate = duplicateIds.has(q.id)
									return (
										<TableRow
											key={q.id}
											className="cursor-pointer hover:bg-muted/50"
										>
											<TableCell className="text-muted-foreground">
												<div className="flex items-center gap-1.5">
													{isDuplicate && (
														<span
															className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
															title="Potential duplicate"
														/>
													)}
													<Link
														href={`/teacher/exam-papers/${paper.id}/questions/${q.id}`}
														className="hover:underline underline-offset-4"
													>
														{q.question_number ?? q.order}
													</Link>
												</div>
											</TableCell>
											<TableCell className="text-muted-foreground text-xs">
												{q.section_title}
											</TableCell>
											<TableCell className="max-w-xs">
												<Link
													href={`/teacher/exam-papers/${paper.id}/questions/${q.id}`}
													className="hover:underline underline-offset-4"
													title={q.text}
												>
													<p className="truncate text-sm">{q.text}</p>
												</Link>
											</TableCell>
											<TableCell>
												<Badge variant={originBadgeVariant(q.origin)}>
													{originLabel(q.origin)}
												</Badge>
											</TableCell>
											<TableCell>{q.points ?? "—"}</TableCell>
											<TableCell>{schemeBadge(q.mark_scheme_status)}</TableCell>
											<TableCell />
										</TableRow>
									)
								})}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			<Separator />

			<div className="text-sm text-muted-foreground">
				<Link
					href={`/teacher/exam-papers/${paper.id}/upload`}
					className="underline underline-offset-4"
				>
					Upload a mark scheme, question paper, or exemplar PDF
				</Link>{" "}
				to populate questions and mark schemes.
			</div>

			<UploadPdfDrawer
				examPaperId={paper.id}
				open={drawerOpen}
				onOpenChange={setDrawerOpen}
				trackingJob={trackingJob}
				onUploadComplete={() => {
					setDrawerOpen(false)
					router.refresh()
				}}
			/>

			<ConfirmDialog
				open={deleteDialogOpen}
				onOpenChange={(open) => {
					if (!deleting) setDeleteDialogOpen(open)
				}}
				title="Delete exam paper?"
				description={`This will permanently delete "${paper.title}" along with all its questions, mark schemes, and uploaded PDFs. This cannot be undone.`}
				confirmLabel={deleting ? "Deleting…" : "Delete paper"}
				loading={deleting}
				onConfirm={handleDelete}
			/>

			{deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
		</>
	)
}

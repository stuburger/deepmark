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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ExamPaperDetail } from "@/lib/dashboard-actions"
import { getActiveIngestionJobsForExamPaper } from "@/lib/pdf-ingestion-actions"
import { BookOpen, Clock, FileText, Globe, Lock, Upload } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { EditableTitle } from "./editable-title"
import { UploadPdfDrawer } from "./upload-pdf-drawer"

type IngestionJob = {
	id: string
	document_type: string
	status: string
	error: string | null
}

const TERMINAL = new Set(["ocr_complete", "failed", "cancelled"])
const POLL_MS = 3000

function linkStatusBadge(status: string | null) {
	if (!status) return <Badge variant="outline">No scheme</Badge>
	switch (status) {
		case "linked":
			return <Badge variant="secondary">Linked</Badge>
		case "auto_linked":
			return (
				<Badge variant="outline" className="border-amber-300 text-amber-700">
					Auto-linked
				</Badge>
			)
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
	/** Rendered server-side and passed as a slot so the server action stays on the server. */
	togglePublicForm: ReactNode
}) {
	const router = useRouter()
	const [tab, setTab] = useState("questions")

	// Drawer state — shared by "Upload PDF" button and "View progress" banner
	const [drawerOpen, setDrawerOpen] = useState(false)
	const [trackingJob, setTrackingJob] = useState<IngestionJob | null>(null)

	// Job polling
	const [jobs, setJobs] = useState<IngestionJob[]>([])
	const prevActiveCount = useRef(0)

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

	// Keep the tracking job state in sync with the latest polled status
	useEffect(() => {
		if (!trackingJob) return
		const updated = jobs.find((j) => j.id === trackingJob.id)
		if (updated && updated.status !== trackingJob.status) {
			setTrackingJob(updated)
		}
	}, [jobs, trackingJob])

	// When all active jobs finish, refresh server data
	useEffect(() => {
		const activeCount = jobs.filter((j) => !TERMINAL.has(j.status)).length
		if (prevActiveCount.current > 0 && activeCount === 0) {
			router.refresh()
		}
		prevActiveCount.current = activeCount
	}, [jobs, router])

	function openForUpload() {
		setTrackingJob(null)
		setDrawerOpen(true)
	}

	function openForTracking(job: IngestionJob) {
		setTrackingJob(job)
		setDrawerOpen(true)
	}

	const activeMarkSchemeJob = jobs.find(
		(j) => j.document_type === "mark_scheme" && !TERMINAL.has(j.status),
	)
	const questionsWithScheme = paper.questions.filter(
		(q) => q.mark_scheme_count > 0,
	)
	const questionsWithoutScheme = paper.questions.filter(
		(q) => q.mark_scheme_count === 0,
	)

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

			{/* Active-job banner */}
			{jobs.filter((j) => !TERMINAL.has(j.status)).length > 0 && (
				<div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
					<Spinner className="h-4 w-4 shrink-0" />
					<span className="text-muted-foreground">
						{activeMarkSchemeJob
							? "Mark scheme PDF is processing."
							: "A PDF is processing."}
					</span>
					<Button
						variant="link"
						className="h-auto p-0 text-sm"
						onClick={() => {
							const job =
								activeMarkSchemeJob ?? jobs.find((j) => !TERMINAL.has(j.status))
							if (job) openForTracking(job)
						}}
					>
						View progress
					</Button>
				</div>
			)}

			{/* Tabs */}
			<Tabs value={tab} onValueChange={setTab}>
				<TabsList>
					<TabsTrigger value="questions">
						Questions ({paper.questions.length})
					</TabsTrigger>
					<TabsTrigger value="mark-schemes" className="gap-1.5">
						<span>
							Mark schemes ({questionsWithScheme.length}/
							{paper.questions.length})
						</span>
						{activeMarkSchemeJob && (
							<Badge
								variant="outline"
								className="border-amber-400/80 bg-amber-500/10 text-amber-800 dark:text-amber-200"
							>
								Processing
							</Badge>
						)}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="questions" className="mt-4">
					<Card>
						<CardHeader>
							<CardTitle>Questions</CardTitle>
							<CardDescription>
								{paper.section_count} section
								{paper.section_count !== 1 ? "s" : ""} ·{" "}
								{paper.questions.length} question
								{paper.questions.length !== 1 ? "s" : ""}
							</CardDescription>
						</CardHeader>
						<CardContent>
							{paper.questions.length === 0 ? (
								<div className="py-8 text-center text-sm text-muted-foreground">
									No questions yet. Upload a question paper or mark scheme PDF
									to populate this paper.
								</div>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-8">#</TableHead>
											<TableHead>Section</TableHead>
											<TableHead>Question</TableHead>
											<TableHead>Origin</TableHead>
											<TableHead className="text-center">Marks</TableHead>
											<TableHead>Mark scheme</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{paper.questions.map((q) => (
											<TableRow key={q.id}>
												<TableCell className="text-muted-foreground">
													{q.order}
												</TableCell>
												<TableCell className="text-muted-foreground text-xs">
													{q.section_title}
												</TableCell>
												<TableCell className="max-w-xs">
													<p className="truncate text-sm" title={q.text}>
														{q.text}
													</p>
												</TableCell>
												<TableCell>
													<Badge variant={originBadgeVariant(q.origin)}>
														{originLabel(q.origin)}
													</Badge>
												</TableCell>
												<TableCell className="text-center">
													{q.points ?? "—"}
												</TableCell>
												<TableCell>
													{linkStatusBadge(q.mark_scheme_status)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="mark-schemes" className="mt-4">
					<Card>
						<CardHeader>
							<CardTitle>Mark scheme coverage</CardTitle>
							<CardDescription>
								{questionsWithScheme.length} of {paper.questions.length}{" "}
								questions have a mark scheme.
								{questionsWithoutScheme.length > 0 && (
									<span className="ml-1 text-amber-600 dark:text-amber-400">
										{questionsWithoutScheme.length} missing.
									</span>
								)}
								{activeMarkSchemeJob && (
									<>
										{" "}
										<button
											type="button"
											className="underline underline-offset-2 text-amber-700 dark:text-amber-300"
											onClick={() => openForTracking(activeMarkSchemeJob)}
										>
											Processing now — tap to view progress.
										</button>
									</>
								)}
							</CardDescription>
						</CardHeader>
						<CardContent>
							{paper.questions.length === 0 ? (
								<p className="py-6 text-center text-sm text-muted-foreground">
									No questions yet.
								</p>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>#</TableHead>
											<TableHead>Question</TableHead>
											<TableHead className="text-center">Marks</TableHead>
											<TableHead>Status</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{paper.questions.map((q) => (
											<TableRow key={q.id}>
												<TableCell className="text-muted-foreground">
													{q.order}
												</TableCell>
												<TableCell className="max-w-xs">
													<p className="truncate text-sm" title={q.text}>
														{q.text}
													</p>
												</TableCell>
												<TableCell className="text-center">
													{q.points ?? "—"}
												</TableCell>
												<TableCell>
													{linkStatusBadge(q.mark_scheme_status)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>

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

			{/* Single drawer — handles both fresh uploads and tracking existing jobs */}
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
		</>
	)
}

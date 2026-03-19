"use client"

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button-variants"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import {
	type JobExemplar,
	type JobMarkScheme,
	type JobQuestion,
	type PdfIngestionJobDetail,
	getPdfIngestionJobDetail,
} from "@/lib/pdf-ingestion-actions"
import {
	AlertCircle,
	BookOpen,
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	Clock,
	ExternalLink,
	FileText,
	GraduationCap,
	RefreshCw,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { DownloadButton } from "../_components/download-button"

const STATUS_CONFIG: Record<
	string,
	{
		label: string
		progress: number
		variant: "default" | "secondary" | "destructive" | "outline"
	}
> = {
	pending: { label: "Queued", progress: 10, variant: "outline" },
	processing: { label: "Processing PDF", progress: 45, variant: "default" },
	extracting: { label: "Extracting data", progress: 75, variant: "default" },
	extracted: { label: "Finalising", progress: 90, variant: "default" },
	ocr_complete: { label: "Complete", progress: 100, variant: "secondary" },
	failed: { label: "Failed", progress: 0, variant: "destructive" },
}

function statusConfig(status: string) {
	return STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
}

const TERMINAL = new Set(["ocr_complete", "failed"])

function docTypeLabel(type: string) {
	switch (type) {
		case "mark_scheme":
			return "Mark scheme"
		case "question_paper":
			return "Question paper"
		case "exemplar":
			return "Exemplar memo"
		case "student_paper":
			return "Student paper"
		default:
			return type
	}
}

function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatDate(d: Date) {
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(d))
}

function MarkSchemeDetail({ ms }: { ms: JobMarkScheme }) {
	const [showTestRuns, setShowTestRuns] = useState(false)

	return (
		<div className="space-y-3">
			<div>
				<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
					Mark scheme description
				</p>
				<p className="text-sm leading-relaxed whitespace-pre-wrap">
					{ms.description}
				</p>
			</div>

			{ms.mark_points.length > 0 && (
				<div>
					<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
						Mark points ({ms.points_total} marks ·{" "}
						{capitalize(ms.marking_method.replace(/_/g, " "))})
					</p>
					<div className="space-y-1.5">
						{ms.mark_points.map((mp) => (
							<div key={mp.point_number} className="flex gap-2 text-sm">
								<span className="shrink-0 font-mono text-xs text-muted-foreground w-5 pt-0.5">
									{mp.point_number}.
								</span>
								<div>
									<span className="font-medium">{mp.description}</span>
									{mp.criteria !== mp.description && (
										<span className="text-muted-foreground">
											{" "}
											— {mp.criteria}
										</span>
									)}
									<Badge
										variant="outline"
										className="ml-2 text-xs tabular-nums"
									>
										{mp.points}pt
									</Badge>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{ms.test_runs.length > 0 && (
				<div>
					<button
						type="button"
						onClick={() => setShowTestRuns((v) => !v)}
						className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
					>
						{showTestRuns ? (
							<ChevronUp className="h-3 w-3" />
						) : (
							<ChevronDown className="h-3 w-3" />
						)}
						Adversarial test runs ({ms.test_runs.length})
					</button>
					{showTestRuns && (
						<div className="mt-2 space-y-2">
							{ms.test_runs.map((tr) => (
								<div
									key={tr.id}
									className="rounded-md border p-2.5 space-y-1.5"
								>
									<div className="flex items-center gap-2 text-xs">
										<span className="text-muted-foreground">Target</span>
										<span className="font-mono font-medium">
											{tr.target_score}
										</span>
										<span className="text-muted-foreground">→ Actual</span>
										<span
											className={`font-mono font-medium ${tr.converged ? "text-green-600" : "text-amber-600"}`}
										>
											{tr.actual_score}
										</span>
										{tr.converged ? (
											<Badge variant="secondary" className="text-xs">
												Converged
											</Badge>
										) : (
											<Badge
												variant="outline"
												className="text-xs border-amber-300 text-amber-700"
											>
												Δ{tr.delta > 0 ? "+" : ""}
												{tr.delta}
											</Badge>
										)}
									</div>
									<details className="text-xs">
										<summary className="cursor-pointer text-muted-foreground hover:text-foreground">
											Grader reasoning
										</summary>
										<p className="mt-1.5 text-muted-foreground whitespace-pre-wrap leading-relaxed pl-2 border-l">
											{tr.grader_reasoning}
										</p>
									</details>
									<details className="text-xs">
										<summary className="cursor-pointer text-muted-foreground hover:text-foreground">
											Synthetic student answer
										</summary>
										<p className="mt-1.5 text-muted-foreground whitespace-pre-wrap leading-relaxed pl-2 border-l">
											{tr.student_answer}
										</p>
									</details>
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	)
}

function QuestionsList({
	questions,
	isProcessing,
}: { questions: JobQuestion[]; isProcessing: boolean }) {
	if (questions.length === 0) {
		return (
			<p className="py-6 text-center text-sm text-muted-foreground">
				{isProcessing ? "Extracting questions…" : "No questions found."}
			</p>
		)
	}

	return (
		<Accordion className="space-y-2">
			{questions.map((q, i) => {
				const ms = q.mark_schemes[0]
				return (
					<AccordionItem
						key={q.id}
						value={q.id}
						className="rounded-lg border px-4"
					>
						<AccordionTrigger className="hover:no-underline py-3">
							<div className="flex items-center gap-3 flex-1 text-left mr-2">
								<span className="shrink-0 text-xs font-mono text-muted-foreground w-5">
									{i + 1}.
								</span>
								<p className="text-sm font-medium line-clamp-2 flex-1">
									{q.text}
								</p>
								<div className="flex items-center gap-1.5 shrink-0">
									{q.points != null && (
										<Badge variant="outline" className="tabular-nums text-xs">
											{q.points}pt
										</Badge>
									)}
									{ms ? (
										<Badge variant="secondary" className="text-xs">
											Scheme
										</Badge>
									) : (
										<Badge
											variant="outline"
											className="text-xs text-muted-foreground"
										>
											No scheme
										</Badge>
									)}
									{ms && ms.test_runs.length > 0 && (
										<Badge
											variant="outline"
											className="text-xs border-blue-300 text-blue-700"
										>
											{ms.test_runs.filter((t) => t.converged).length}/
											{ms.test_runs.length} converged
										</Badge>
									)}
								</div>
							</div>
						</AccordionTrigger>
						<AccordionContent className="pb-4">
							{ms ? (
								<MarkSchemeDetail ms={ms} />
							) : (
								<p className="text-sm text-muted-foreground">
									No mark scheme extracted for this question.
								</p>
							)}
						</AccordionContent>
					</AccordionItem>
				)
			})}
		</Accordion>
	)
}

function ExemplarsList({ exemplars }: { exemplars: JobExemplar[] }) {
	if (exemplars.length === 0) return null
	return (
		<div className="space-y-2">
			{exemplars.map((ex) => (
				<div key={ex.id} className="rounded-lg border p-3 space-y-1">
					<div className="flex items-center gap-2">
						<Badge variant="outline" className="text-xs">
							L{ex.level}
						</Badge>
						{ex.expected_score != null && (
							<Badge variant="secondary" className="text-xs">
								{ex.expected_score} marks
							</Badge>
						)}
						{ex.mark_band && (
							<span className="text-xs text-muted-foreground">
								{ex.mark_band}
							</span>
						)}
					</div>
					<p className="text-xs text-muted-foreground line-clamp-1">
						{ex.raw_question_text}
					</p>
					<p className="text-sm line-clamp-3">{ex.answer_text}</p>
				</div>
			))}
		</div>
	)
}

export function JobStatusPage({
	initialJob,
	jobId,
}: {
	initialJob: PdfIngestionJobDetail
	jobId: string
}) {
	const [job, setJob] = useState(initialJob)

	const poll = useCallback(async () => {
		const result = await getPdfIngestionJobDetail(jobId)
		if (result.ok) setJob(result.job)
	}, [jobId])

	useEffect(() => {
		if (TERMINAL.has(job.status)) return
		const interval = setInterval(poll, 3000)
		return () => clearInterval(interval)
	}, [job.status, poll])

	const cfg = statusConfig(job.status)
	const isProcessing = !TERMINAL.has(job.status)
	const isFailed = job.status === "failed"
	const isDone = job.status === "ocr_complete"

	return (
		<div className="max-w-3xl space-y-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<Link
						href="/admin/upload"
						className="text-sm text-muted-foreground hover:text-foreground"
					>
						← PDF jobs
					</Link>
					<h1 className="mt-1 text-2xl font-semibold">
						{docTypeLabel(job.document_type)} upload
					</h1>
					<p className="text-xs text-muted-foreground font-mono mt-0.5">
						{job.id}
					</p>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<DownloadButton jobId={job.id} />
					{(isFailed || isDone) && (
						<Link
							href={`/admin/upload/new?retrigger=${job.id}`}
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							<RefreshCw className="h-3.5 w-3.5 mr-1.5" />
							Retry
						</Link>
					)}
				</div>
			</div>

			<Card>
				<CardContent className="pt-5 space-y-3">
					<div className="flex items-center gap-3">
						{isProcessing ? (
							<Spinner className="h-5 w-5 shrink-0" />
						) : isDone ? (
							<CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
						) : (
							<AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
						)}
						<div className="flex-1">
							<p className="text-sm font-medium">{cfg.label}</p>
							{isProcessing && (
								<p className="text-xs text-muted-foreground">
									{job.run_adversarial_loop
										? "Extracting mark scheme and running adversarial quality checks…"
										: "Extracting questions and mark scheme from PDF…"}
								</p>
							)}
						</div>
						<Badge variant={cfg.variant}>{cfg.label}</Badge>
					</div>
					{!isFailed && <Progress value={cfg.progress} className="h-2" />}
					{isProcessing && (
						<p className="text-xs text-muted-foreground">
							{job.run_adversarial_loop
								? "This may take 5–20 minutes. You can refresh safely — progress is saved."
								: "This usually takes 30–90 seconds. You can refresh safely — progress is saved."}
						</p>
					)}
				</CardContent>
			</Card>

			{isFailed && job.error && (
				<Alert variant="destructive">
					<AlertCircle />
					<AlertTitle>Processing failed</AlertTitle>
					<AlertDescription>{job.error}</AlertDescription>
				</Alert>
			)}

			{job.exam_paper_id && (
				<Card>
					<CardContent className="pt-4 flex items-center justify-between gap-4">
						<div className="flex items-center gap-3">
							<FileText className="h-4 w-4 text-muted-foreground shrink-0" />
							<div>
								<p className="text-xs text-muted-foreground">
									Linked exam paper
								</p>
								<p className="text-sm font-medium">
									{job.exam_paper_title ?? job.exam_paper_id}
								</p>
							</div>
						</div>
						<Link
							href={`/teacher/exam-papers/${job.exam_paper_id}`}
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							<ExternalLink className="h-3.5 w-3.5 mr-1.5" />
							View paper
						</Link>
					</CardContent>
				</Card>
			)}

			<div className="grid grid-cols-3 gap-4">
				<Card>
					<CardContent className="pt-4 flex items-center gap-3">
						<BookOpen className="h-5 w-5 text-muted-foreground shrink-0" />
						<div>
							<p className="text-2xl font-bold">{job.question_count}</p>
							<p className="text-xs text-muted-foreground">Questions</p>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4 flex items-center gap-3">
						<GraduationCap className="h-5 w-5 text-muted-foreground shrink-0" />
						<div>
							<p className="text-2xl font-bold">{job.exemplar_count}</p>
							<p className="text-xs text-muted-foreground">Exemplars</p>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4 flex items-center gap-3">
						<Clock className="h-5 w-5 text-muted-foreground shrink-0" />
						<div>
							<p className="text-2xl font-bold">{job.attempt_count}</p>
							<p className="text-xs text-muted-foreground">Attempts</p>
						</div>
					</CardContent>
				</Card>
			</div>

			{(job.document_type === "mark_scheme" ||
				job.document_type === "question_paper") && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							Questions extracted
							{isProcessing && <Spinner className="h-4 w-4" />}
						</CardTitle>
						<CardDescription>
							{job.document_type === "mark_scheme"
								? "Expand each question to see the full mark scheme, mark points, and (if enabled) adversarial test run results."
								: "Questions extracted from the question paper."}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<QuestionsList
							questions={job.questions}
							isProcessing={isProcessing}
						/>
					</CardContent>
				</Card>
			)}

			{job.document_type === "exemplar" && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							Exemplar answers
							{isProcessing && <Spinner className="h-4 w-4" />}
						</CardTitle>
						<CardDescription>
							Exemplar student answers extracted from the memo PDF.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ExemplarsList exemplars={job.exemplars} />
						{isProcessing && job.exemplar_count === 0 && (
							<p className="py-4 text-center text-sm text-muted-foreground">
								Extracting exemplars…
							</p>
						)}
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Job details</CardTitle>
				</CardHeader>
				<CardContent className="text-sm">
					{[
						["Document type", docTypeLabel(job.document_type)],
						["Exam board", job.exam_board],
						["Subject", job.subject ? capitalize(job.subject) : "—"],
						["Year", job.year ?? "—"],
						["Paper reference", job.paper_reference ?? "—"],
						[
							"Adversarial check",
							job.run_adversarial_loop ? "Enabled" : "Disabled",
						],
						["Uploaded", formatDate(job.created_at)],
						[
							"Completed",
							job.processed_at ? formatDate(job.processed_at) : "—",
						],
					].map(([label, value], i, arr) => (
						<div key={String(label)}>
							<div className="flex items-start justify-between gap-4 py-2.5">
								<span className="text-muted-foreground shrink-0">{label}</span>
								<span className="text-right">{value}</span>
							</div>
							{i < arr.length - 1 && <Separator />}
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	)
}

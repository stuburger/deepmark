"use client"

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
import type { PdfIngestionJobDetail } from "@/lib/pdf-ingestion/job-lifecycle"
import {
	AlertCircle,
	BookOpen,
	CheckCircle2,
	Clock,
	ExternalLink,
	FileText,
	GraduationCap,
	RefreshCw,
} from "lucide-react"
import Link from "next/link"
import { DownloadButton } from "../_components/download-button"
import { ExemplarsList } from "./exemplars-list"
import { useJobPoll } from "./hooks/use-job-poll"
import {
	TERMINAL,
	capitalize,
	docTypeLabel,
	formatDate,
	statusConfig,
} from "./job-status-config"
import { QuestionsList } from "./questions-list"

export function JobStatusPage({
	initialJob,
	jobId,
}: {
	initialJob: PdfIngestionJobDetail
	jobId: string
}) {
	const job = useJobPoll(jobId, initialJob)

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

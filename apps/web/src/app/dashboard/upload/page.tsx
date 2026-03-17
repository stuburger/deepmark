import Link from "next/link"
import { buttonVariants } from "@/components/ui/button-variants"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { listPdfIngestionJobs, type PdfIngestionJobListItem } from "@/lib/pdf-ingestion-actions"
import { DownloadButton } from "./_components/download-button"
import { PlusCircle } from "lucide-react"

type StatusVariant = "default" | "secondary" | "destructive" | "outline"

function statusBadgeVariant(status: string): StatusVariant {
	switch (status) {
		case "pending":
			return "outline"
		case "processing":
		case "extracting":
			return "default"
		case "ocr_complete":
		case "extracted":
			return "secondary"
		case "failed":
			return "destructive"
		default:
			return "outline"
	}
}

function statusLabel(status: string): string {
	switch (status) {
		case "pending":
			return "Pending"
		case "processing":
			return "Processing"
		case "ocr_complete":
			return "OCR complete"
		case "extracting":
			return "Extracting"
		case "extracted":
			return "Extracted"
		case "failed":
			return "Failed"
		default:
			return status
	}
}

function docTypeLabel(type: string): string {
	return type === "mark_scheme" ? "Mark scheme" : "Exemplar"
}

function formatDate(date: Date): string {
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(date))
}

function JobRow({ job }: { job: PdfIngestionJobListItem }) {
	return (
		<TableRow>
			<TableCell>
				<Badge variant={statusBadgeVariant(job.status)}>{statusLabel(job.status)}</Badge>
			</TableCell>
			<TableCell className="font-medium">{docTypeLabel(job.document_type)}</TableCell>
			<TableCell>{job.exam_board}</TableCell>
			<TableCell className="capitalize">{job.subject ?? "—"}</TableCell>
			<TableCell>{job.year ?? "—"}</TableCell>
			<TableCell>{job.paper_reference ?? "—"}</TableCell>
			<TableCell className="text-muted-foreground">{formatDate(job.created_at)}</TableCell>
			<TableCell>
				<div className="flex items-center gap-1">
					<DownloadButton jobId={job.id} />
					<Link
						href={`/dashboard/upload/${job.id}`}
						className={buttonVariants({ variant: "ghost", size: "sm" })}
					>
						View
					</Link>
					{job.status === "failed" || job.status === "ocr_complete" ? (
						<Link
							href={`/dashboard/upload/new?retrigger=${job.id}`}
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							Retry
						</Link>
					) : null}
				</div>
			</TableCell>
		</TableRow>
	)
}

export default async function PdfIngestionJobsPage() {
	const result = await listPdfIngestionJobs()

	return (
		<div className="container py-8 space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">PDF ingestion jobs</h1>
					<p className="text-sm text-muted-foreground mt-1">
						View and manage your uploaded PDF processing jobs.
					</p>
				</div>
				<Link href="/dashboard/upload/new" className={buttonVariants()}>
					<PlusCircle />
					New upload
				</Link>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>All jobs</CardTitle>
					<CardDescription>
						Mark scheme and exemplar PDFs you have uploaded for ingestion.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{!result.ok ? (
						<p className="text-sm text-destructive">{result.error}</p>
					) : result.jobs.length === 0 ? (
						<p className="text-sm text-muted-foreground py-8 text-center">
							No jobs yet.{" "}
							<Link href="/dashboard/upload/new" className="underline underline-offset-4">
								Upload your first PDF.
							</Link>
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Status</TableHead>
									<TableHead>Type</TableHead>
									<TableHead>Exam board</TableHead>
									<TableHead>Subject</TableHead>
									<TableHead>Year</TableHead>
									<TableHead>Reference</TableHead>
									<TableHead>Uploaded</TableHead>
									<TableHead>Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{result.jobs.map((job) => (
									<JobRow key={job.id} job={job} />
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	)
}

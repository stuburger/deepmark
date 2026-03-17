import Link from "next/link"
import { notFound } from "next/navigation"
import { AlertCircle, FileText, BookOpen, ImageIcon } from "lucide-react"
import { getPdfIngestionJobDetail } from "@/lib/pdf-ingestion-actions"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button-variants"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { DownloadButton } from "../_components/download-button"

type StatusVariant = "default" | "secondary" | "destructive" | "outline"

function statusBadgeVariant(status: string): StatusVariant {
	switch (status) {
		case "pending": return "outline"
		case "processing":
		case "extracting": return "default"
		case "ocr_complete":
		case "extracted": return "secondary"
		case "failed": return "destructive"
		default: return "outline"
	}
}

function statusLabel(status: string): string {
	switch (status) {
		case "pending": return "Pending"
		case "processing": return "Processing"
		case "ocr_complete": return "OCR complete"
		case "extracting": return "Extracting"
		case "extracted": return "Extracted"
		case "failed": return "Failed"
		default: return status
	}
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

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex items-start justify-between gap-4 py-2.5">
			<span className="text-sm text-muted-foreground shrink-0">{label}</span>
			<span className="text-sm text-right">{value}</span>
		</div>
	)
}

export default async function PdfIngestionJobDetailPage({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const result = await getPdfIngestionJobDetail(id)

	if (!result.ok) {
		if (result.error === "Job not found") notFound()
		return (
			<div className="container py-8">
				<p className="text-sm text-destructive">{result.error}</p>
			</div>
		)
	}

	const { job } = result

	return (
		<div className="container max-w-3xl py-8 space-y-6">
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-1">
					<Link
						href="/dashboard/upload"
						className="text-sm text-muted-foreground hover:text-foreground"
					>
						← PDF jobs
					</Link>
					<h1 className="text-2xl font-semibold">
						{job.document_type === "mark_scheme" ? "Mark scheme" : "Exemplar"} upload
					</h1>
					<p className="text-sm text-muted-foreground font-mono">{job.id}</p>
				</div>
				<div className="flex items-center gap-2">
					<DownloadButton jobId={job.id} />
					{(job.status === "failed" || job.status === "ocr_complete") && (
						<Link
							href={`/dashboard/upload/new?retrigger=${job.id}`}
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							Retry
						</Link>
					)}
				</div>
			</div>

			{job.status === "failed" && job.error && (
				<Alert variant="destructive">
					<AlertCircle />
					<AlertTitle>Processing failed</AlertTitle>
					<AlertDescription>{job.error}</AlertDescription>
				</Alert>
			)}

			<div className="grid gap-6 sm:grid-cols-3">
				<Card>
					<CardContent className="pt-6">
						<div className="flex items-center gap-3">
							<div className="rounded-md bg-muted p-2">
								<FileText className="size-5 text-muted-foreground" />
							</div>
							<div>
								<p className="text-2xl font-semibold">{job.question_count}</p>
								<p className="text-xs text-muted-foreground">Questions extracted</p>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-6">
						<div className="flex items-center gap-3">
							<div className="rounded-md bg-muted p-2">
								<ImageIcon className="size-5 text-muted-foreground" />
							</div>
							<div>
								<p className="text-2xl font-semibold">{job.exemplar_count}</p>
								<p className="text-xs text-muted-foreground">Exemplar answers</p>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-6">
						<div className="flex items-center gap-3">
							<div className="rounded-md bg-muted p-2">
								<BookOpen className="size-5 text-muted-foreground" />
							</div>
							<div>
								<p className="text-2xl font-semibold">{job.attempt_count}</p>
								<p className="text-xs text-muted-foreground">Processing attempts</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Job details</CardTitle>
					<CardDescription>Full metadata for this ingestion job.</CardDescription>
				</CardHeader>
				<CardContent>
					<DetailRow
						label="Status"
						value={
							<Badge variant={statusBadgeVariant(job.status)}>
								{statusLabel(job.status)}
							</Badge>
						}
					/>
					<Separator />
					<DetailRow
						label="Document type"
						value={job.document_type === "mark_scheme" ? "Mark scheme" : "Exemplar"}
					/>
					<Separator />
					<DetailRow label="Exam board" value={job.exam_board} />
					<Separator />
					<DetailRow
						label="Subject"
						value={<span className="capitalize">{job.subject ?? "—"}</span>}
					/>
					<Separator />
					<DetailRow label="Year" value={job.year ?? "—"} />
					<Separator />
					<DetailRow label="Paper reference" value={job.paper_reference ?? "—"} />
					<Separator />
					<DetailRow
						label="Auto-create exam paper"
						value={job.auto_create_exam_paper ? "Yes" : "No"}
					/>
					<Separator />
					<DetailRow label="Uploaded" value={formatDate(job.created_at)} />
					<Separator />
					<DetailRow
						label="Processed"
						value={job.processed_at ? formatDate(job.processed_at) : "—"}
					/>
					<Separator />
					<DetailRow label="S3 key" value={<span className="font-mono text-xs break-all">{job.s3_key || "—"}</span>} />
				</CardContent>
			</Card>

			{job.detected_exam_paper_metadata !== null && (
				<Card>
					<CardHeader>
						<CardTitle>Detected exam paper metadata</CardTitle>
						<CardDescription>
							Metadata automatically extracted from the PDF during OCR.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<pre className="rounded-md bg-muted p-4 text-xs overflow-x-auto">
							{JSON.stringify(job.detected_exam_paper_metadata, null, 2)}
						</pre>
					</CardContent>
				</Card>
			)}
		</div>
	)
}

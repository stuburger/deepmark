"use client"

import { buttonVariants } from "@/components/ui/button-variants"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { getPdfIngestionJobDownloadUrl } from "@/lib/pdf-ingestion/job-lifecycle"
import {
	type PdfDocument,
	getPdfDocumentsForPaper,
} from "@/lib/pdf-ingestion/queries"
import { FileText } from "lucide-react"
import { useEffect, useState } from "react"

const DOC_TYPE_LABELS: Record<string, string> = {
	mark_scheme: "Mark scheme",
	question_paper: "Question paper",
	exemplar: "Exemplar",
}

function docTypeLabel(type: string) {
	return DOC_TYPE_LABELS[type] ?? type
}

function formatDate(date: Date | null) {
	if (!date) return null
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	}).format(new Date(date))
}

// ── Single PDF viewer dialog ──────────────────────────────────────────────────

export function PdfViewerDialog({
	jobId,
	label,
}: {
	jobId: string
	label: string
}) {
	const [open, setOpen] = useState(false)
	const [url, setUrl] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function handleOpen() {
		setOpen(true)
		if (url) return // already fetched
		setLoading(true)
		setError(null)
		const result = await getPdfIngestionJobDownloadUrl(jobId)
		setLoading(false)
		if (!result.ok) {
			setError(result.error)
			return
		}
		setUrl(result.url)
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				className={buttonVariants({ variant: "ghost", size: "sm" })}
				onClick={handleOpen}
			>
				<FileText className="h-3.5 w-3.5 mr-1.5" />
				View
			</DialogTrigger>
			<DialogContent className="max-w-5xl w-full h-[90vh] flex flex-col p-0 gap-0">
				<DialogHeader className="px-4 py-3 border-b shrink-0">
					<DialogTitle className="text-base">{label}</DialogTitle>
				</DialogHeader>
				<div className="flex-1 min-h-0">
					{loading && (
						<div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
							<Spinner className="h-5 w-5" />
							<span>Loading PDF…</span>
						</div>
					)}
					{error && (
						<div className="flex h-full items-center justify-center text-sm text-destructive">
							{error}
						</div>
					)}
					{url && (
						<iframe
							src={url}
							className="w-full h-full border-0"
							title={label}
						/>
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}

// ── Documents panel ───────────────────────────────────────────────────────────

export function PdfDocumentsPanel({ examPaperId }: { examPaperId: string }) {
	const [documents, setDocuments] = useState<PdfDocument[] | null>(null)

	useEffect(() => {
		getPdfDocumentsForPaper(examPaperId).then((r) => {
			if (r.ok) setDocuments(r.documents)
		})
	}, [examPaperId])

	// Don't render until loaded, and hide entirely if no documents
	if (!documents || documents.length === 0) return null

	return (
		<div className="flex flex-wrap gap-2">
			{documents.map((doc) => (
				<div
					key={doc.id}
					className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm"
				>
					<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
					<span className="font-medium">{docTypeLabel(doc.document_type)}</span>
					{doc.processed_at && (
						<span className="text-xs text-muted-foreground">
							{formatDate(doc.processed_at)}
						</span>
					)}
					<PdfViewerDialog
						jobId={doc.id}
						label={docTypeLabel(doc.document_type)}
					/>
				</div>
			))}
		</div>
	)
}

"use client"

import { Spinner } from "@/components/ui/spinner"
import type { PdfDocument } from "@/lib/pdf-ingestion-actions"
import { createLinkedPdfUpload } from "@/lib/pdf-ingestion-actions"
import {
	CheckCircle2,
	FileText,
	ScrollText,
	Upload,
	XCircle,
} from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { PdfViewerDialog } from "./pdf-preview-dialog"

type DocType = "question_paper" | "mark_scheme" | "exemplar"

type ActiveJob = {
	id: string
	document_type: string
	status: string
	error: string | null
}

const TERMINAL = new Set(["ocr_complete", "failed", "cancelled"])

const DOC_CONFIGS: {
	type: DocType
	label: string
	description: string
	icon: typeof FileText
}[] = [
	{
		type: "question_paper",
		label: "Question Paper",
		description: "Populates questions without mark scheme",
		icon: ScrollText,
	},
	{
		type: "mark_scheme",
		label: "Mark Scheme",
		description: "Populates questions and mark scheme criteria",
		icon: FileText,
	},
	{
		type: "exemplar",
		label: "Exemplar",
		description: "Adds exemplar student answers",
		icon: ScrollText,
	},
]

function formatDate(date: Date | null) {
	if (!date) return null
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	}).format(new Date(date))
}

function DocCard({
	config,
	examPaperId,
	completedDoc,
	activeJob,
	onJobStarted,
}: {
	config: (typeof DOC_CONFIGS)[number]
	examPaperId: string
	completedDoc: PdfDocument | null
	activeJob: ActiveJob | null
	onJobStarted: () => void
}) {
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [uploading, setUploading] = useState(false)

	const isAcquired = completedDoc !== null
	const isProcessing = activeJob !== null && !TERMINAL.has(activeJob.status)
	const isFailed =
		activeJob !== null && activeJob.status === "failed" && !isAcquired
	const canUpload = !isAcquired && !isProcessing && !uploading

	async function handleFile(file: File) {
		if (!file.type.includes("pdf")) {
			toast.error("Please select a PDF file.")
			return
		}
		setUploading(true)
		try {
			const result = await createLinkedPdfUpload({
				exam_paper_id: examPaperId,
				document_type: config.type,
				run_adversarial_loop: false,
			})
			if (!result.ok) {
				toast.error(result.error)
				return
			}
			const putRes = await fetch(result.url, {
				method: "PUT",
				body: file,
				headers: { "Content-Type": "application/pdf" },
			})
			if (!putRes.ok) {
				toast.error("Upload to storage failed. Please try again.")
				return
			}
			onJobStarted()
		} catch {
			toast.error("Upload failed. Please try again.")
		} finally {
			setUploading(false)
		}
	}

	const Icon = config.icon

	return (
		<div
			role={canUpload ? "button" : undefined}
			tabIndex={canUpload ? 0 : undefined}
			onClick={() => {
				if (canUpload) fileInputRef.current?.click()
			}}
			onKeyDown={(e) => {
				if (canUpload && (e.key === "Enter" || e.key === " ")) {
					fileInputRef.current?.click()
				}
			}}
			className={[
				"rounded-xl border p-4 flex flex-col gap-3 transition-colors",
				isAcquired
					? "border-green-500/40 bg-green-500/5"
					: isProcessing || uploading
						? "border-border bg-muted/20"
						: isFailed
							? "border-destructive/40 bg-destructive/5"
							: "border-dashed border-border cursor-pointer hover:bg-muted/30 hover:border-primary/40",
			].join(" ")}
		>
			{/* Icon + title */}
			<div className="flex items-start gap-2.5">
				{isAcquired ? (
					<CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
				) : isProcessing || uploading ? (
					<Spinner className="h-5 w-5 shrink-0 mt-0.5 text-muted-foreground" />
				) : isFailed ? (
					<XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
				) : (
					<Icon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
				)}
				<div className="min-w-0">
					<p className="text-sm font-medium">{config.label}</p>
					<p className="text-xs text-muted-foreground leading-snug">
						{config.description}
					</p>
				</div>
			</div>

			{/* Status line */}
			{isAcquired && completedDoc && (
				<div className="flex items-center justify-between gap-2">
					<div>
						<span className="text-xs font-medium text-green-700 dark:text-green-400">
							Acquired
						</span>
						{completedDoc.processed_at && (
							<span className="ml-1.5 text-xs text-muted-foreground">
								{formatDate(completedDoc.processed_at)}
							</span>
						)}
					</div>
					<PdfViewerDialog jobId={completedDoc.id} label={config.label} />
				</div>
			)}

			{(isProcessing || uploading) && (
				<p className="text-xs text-muted-foreground">
					{uploading ? "Uploading…" : "Processing your PDF…"}
				</p>
			)}

			{isFailed && (
				<div>
					<p className="text-xs text-destructive font-medium">
						Processing failed
					</p>
					{activeJob?.error && (
						<p className="text-xs text-destructive/70 mt-0.5 leading-snug">
							{activeJob.error}
						</p>
					)}
					<p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
						<Upload className="h-3 w-3" />
						Click to try again
					</p>
				</div>
			)}

			{!isAcquired && !isProcessing && !uploading && !isFailed && (
				<p className="text-xs text-muted-foreground flex items-center gap-1">
					<Upload className="h-3 w-3" />
					Click to upload PDF
				</p>
			)}

			<input
				ref={fileInputRef}
				type="file"
				accept=".pdf,application/pdf"
				className="sr-only"
				onChange={(e) => {
					const f = e.target.files?.[0]
					if (f) handleFile(f)
					e.target.value = ""
				}}
			/>
		</div>
	)
}

export function DocumentUploadCards({
	examPaperId,
	completedDocs,
	activeJobs,
	onJobStarted,
}: {
	examPaperId: string
	completedDocs: PdfDocument[]
	activeJobs: ActiveJob[]
	onJobStarted: () => void
}) {
	return (
		<div className="grid grid-cols-3 gap-3">
			{DOC_CONFIGS.map((config) => (
				<DocCard
					key={config.type}
					config={config}
					examPaperId={examPaperId}
					completedDoc={
						completedDocs.find((d) => d.document_type === config.type) ?? null
					}
					activeJob={
						activeJobs.find((j) => j.document_type === config.type) ?? null
					}
					onJobStarted={onJobStarted}
				/>
			))}
		</div>
	)
}

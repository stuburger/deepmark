"use client"

import { Spinner } from "@/components/ui/spinner"
import type { PdfDocument } from "@/lib/pdf-ingestion/queries"
import { createLinkedPdfUpload } from "@/lib/pdf-ingestion/upload"
import { validatePdfFile } from "@/lib/upload-validation"
import { cn } from "@/lib/utils"
import {
	CheckCircle2,
	FileText,
	ScrollText,
	Upload,
	XCircle,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { DocumentPdfPreviewDialog } from "./document-pdf-preview-dialog"

type DocType = "question_paper" | "mark_scheme"

type ActiveJob = {
	id: string
	document_type: string
	status: string
	error: string | null
}

const TERMINAL = new Set(["ocr_complete", "failed", "cancelled"])

const DOC_LABELS: Record<DocType, string> = {
	question_paper: "Question paper",
	mark_scheme: "Mark scheme",
}

const DOC_ICONS: Record<DocType, typeof FileText> = {
	question_paper: ScrollText,
	mark_scheme: FileText,
}

type Props = {
	examPaperId: string
	documentType: DocType
	completedDoc: PdfDocument | null
	activeJob: ActiveJob | null
	onJobStarted: () => void
	/** "default" = full upload card with labels; "compact" = small header thumbnail with tooltip-only labels. */
	size?: "default" | "compact"
	/**
	 * Replaces the built-in `size` width/height classes when set (other frame
	 * styles like border and hover states still apply).
	 */
	thumbnailClassName?: string
	/**
	 * Target width in CSS pixels when rasterising the first PDF page to the
	 * canvas. Default 640 (2× the previous 320) so thumbnails stay sharp at
	 * the larger default layout.
	 */
	pdfPreviewCanvasWidth?: number
}

export function DocumentThumbnail({
	examPaperId,
	documentType,
	completedDoc,
	activeJob,
	onJobStarted,
	size = "default",
	thumbnailClassName,
	pdfPreviewCanvasWidth = 640,
}: Props) {
	const compact = size === "compact"
	const fileInputRef = useRef<HTMLInputElement>(null)
	const canvasRef = useRef<HTMLCanvasElement | null>(null)
	const [uploading, setUploading] = useState(false)
	const [thumbReady, setThumbReady] = useState(false)
	const [previewOpen, setPreviewOpen] = useState(false)

	const isAcquired = completedDoc !== null
	const isProcessing = activeJob !== null && !TERMINAL.has(activeJob.status)
	const isFailed =
		activeJob !== null && activeJob.status === "failed" && !isAcquired
	const canUpload = !isAcquired && !isProcessing && !uploading

	const completedDocId = completedDoc?.id ?? null
	const pdfUrl = completedDocId
		? `/api/pdf-ingestion-jobs/${encodeURIComponent(completedDocId)}/document`
		: null

	// Render first page to canvas once we have the URL.
	useEffect(() => {
		setThumbReady(false)
		if (!pdfUrl) return
		const canvas = canvasRef.current
		if (!canvas) return
		let cancelled = false
		;(async () => {
			try {
				const pdfjs = await import("pdfjs-dist")
				pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
				const doc = await pdfjs.getDocument({ url: pdfUrl }).promise
				if (cancelled) return
				const page = await doc.getPage(1)
				if (cancelled) return
				const baseViewport = page.getViewport({ scale: 1 })
				const scale = pdfPreviewCanvasWidth / baseViewport.width
				const viewport = page.getViewport({ scale })
				canvas.width = Math.floor(viewport.width)
				canvas.height = Math.floor(viewport.height)
				const ctx = canvas.getContext("2d")
				if (!ctx) return
				await page.render({ canvasContext: ctx, viewport, canvas }).promise
				if (cancelled) return
				setThumbReady(true)
			} catch {
				// Render failure leaves the icon placeholder visible — preview still
				// works via the raw URL.
			}
		})()
		return () => {
			cancelled = true
		}
	}, [pdfUrl, pdfPreviewCanvasWidth])

	async function handleFile(file: File) {
		const validation = validatePdfFile(file)
		if (!validation.ok) {
			toast.error(validation.error)
			return
		}
		setUploading(true)
		try {
			const result = await createLinkedPdfUpload({
				exam_paper_id: examPaperId,
				document_type: documentType,
				run_adversarial_loop: false,
			})
			if (result?.serverError) {
				toast.error(result.serverError)
				return
			}
			if (!result?.data) {
				toast.error("Upload failed")
				return
			}
			const putRes = await fetch(result.data.url, {
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

	const Icon = DOC_ICONS[documentType]
	const label = DOC_LABELS[documentType]

	function handleClick() {
		if (canUpload) {
			fileInputRef.current?.click()
			return
		}
		if (isAcquired && pdfUrl) {
			setPreviewOpen(true)
		}
	}

	return (
		<>
			<button
				type="button"
				onClick={handleClick}
				onKeyDown={(e) => {
					if ((e.key === "Enter" || e.key === " ") && canUpload) {
						fileInputRef.current?.click()
					}
				}}
				disabled={isProcessing || uploading}
				title={
					isAcquired
						? `Preview ${label}`
						: canUpload
							? `Upload ${label}`
							: label
				}
				className={cn(
					"group relative shrink-0 overflow-hidden rounded-md border bg-muted/30 transition-all",
					thumbnailClassName ?? (compact ? "h-48 w-34" : "aspect-3/4 w-64"),
					isAcquired
						? "border-border shadow-sm hover:shadow-md cursor-zoom-in"
						: isFailed
							? "border-destructive/40 bg-destructive/5 cursor-pointer hover:bg-destructive/10"
							: isProcessing || uploading
								? "border-border bg-muted/30"
								: "border-dashed border-muted-foreground/40 cursor-pointer hover:bg-muted/50 hover:border-primary/40",
				)}
				aria-label={
					isAcquired
						? `Preview ${label}`
						: canUpload
							? `Upload ${label}`
							: label
				}
			>
				{/* PDF first-page render */}
				{isAcquired && (
					<canvas
						ref={canvasRef}
						className={cn(
							"absolute inset-0 h-full w-full object-cover transition-opacity",
							thumbReady ? "opacity-100" : "opacity-0",
						)}
					/>
				)}

				{/* Empty / placeholder state */}
				{!isAcquired &&
					!isProcessing &&
					!uploading &&
					!isFailed &&
					(compact ? (
						<div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
							<Icon className="h-6 w-6" />
							<Upload className="h-3.5 w-3.5 opacity-60" />
						</div>
					) : (
						<div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center text-muted-foreground">
							<Icon className="h-7 w-7" />
							<span className="text-[11px] font-medium leading-tight">
								{label}
							</span>
							<span className="text-[10px] flex items-center gap-1 text-muted-foreground/80">
								<Upload className="h-3 w-3" />
								Click to upload
							</span>
						</div>
					))}

				{/* Failed state */}
				{isFailed &&
					(compact ? (
						<div className="absolute inset-0 flex items-center justify-center text-destructive">
							<XCircle className="h-6 w-6" />
						</div>
					) : (
						<div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center text-destructive">
							<XCircle className="h-6 w-6" />
							<span className="text-[10px] font-medium">Failed</span>
							<span className="text-[10px] text-muted-foreground">
								Click to retry
							</span>
						</div>
					))}

				{/* Pre-render fallback while PDF loads */}
				{isAcquired && !thumbReady && (
					<div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
						<Icon className={compact ? "h-6 w-6" : "h-7 w-7"} />
					</div>
				)}

				{/* Status badge — bottom-right corner */}
				{(isAcquired || isProcessing || uploading) && (
					<div className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border">
						{isProcessing || uploading ? (
							<Spinner className="h-3.5 w-3.5 text-muted-foreground" />
						) : (
							<CheckCircle2 className="h-4 w-4 text-success" />
						)}
					</div>
				)}
			</button>

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

			{isAcquired && pdfUrl && (
				<DocumentPdfPreviewDialog
					open={previewOpen}
					onOpenChange={setPreviewOpen}
					title={label}
					pdfUrl={pdfUrl}
				/>
			)}
		</>
	)
}

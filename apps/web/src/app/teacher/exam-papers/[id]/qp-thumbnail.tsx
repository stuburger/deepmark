"use client"

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { getPdfIngestionJobDownloadUrl } from "@/lib/pdf-ingestion/job-lifecycle"
import { cn } from "@/lib/utils"
import { FileText } from "lucide-react"
import { useEffect, useRef, useState } from "react"

type Props = {
	jobId: string | null
	className?: string
}

export function QuestionPaperThumbnail({ jobId, className }: Props) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null)
	const [pdfUrl, setPdfUrl] = useState<string | null>(null)
	const [thumbReady, setThumbReady] = useState(false)
	const [open, setOpen] = useState(false)

	// Fetch the presigned URL once jobId is known
	useEffect(() => {
		if (!jobId) return
		let cancelled = false
		getPdfIngestionJobDownloadUrl(jobId).then((r) => {
			if (cancelled) return
			if (!r.ok) {
				console.error("Failed to load QP download URL", r.error)
				return
			}
			setPdfUrl(r.url)
		})
		return () => {
			cancelled = true
		}
	}, [jobId])

	// Render the first page of the PDF to the canvas
	useEffect(() => {
		if (!pdfUrl) return
		const canvas = canvasRef.current
		if (!canvas) return
		let cancelled = false
		;(async () => {
			try {
				const pdfjs = await import("pdfjs-dist")
				// Worker is copied to /public/pdf.worker.min.mjs at install time.
				pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

				const doc = await pdfjs.getDocument({ url: pdfUrl }).promise
				if (cancelled) return
				const page = await doc.getPage(1)
				if (cancelled) return

				const baseViewport = page.getViewport({ scale: 1 })
				// Backing buffer ~2x the display width for crisp rendering on retina;
				// the displayed size is controlled by CSS (object-cover) on the canvas.
				const scale = 240 / baseViewport.width
				const viewport = page.getViewport({ scale })

				canvas.width = Math.floor(viewport.width)
				canvas.height = Math.floor(viewport.height)

				const ctx = canvas.getContext("2d")
				if (!ctx) {
					console.error("QP thumbnail: failed to acquire 2D canvas context")
					return
				}

				await page.render({ canvasContext: ctx, viewport, canvas }).promise
				if (cancelled) return
				setThumbReady(true)
			} catch (err) {
				if (!cancelled) {
					console.error("Failed to render QP thumbnail", err)
				}
			}
		})()

		return () => {
			cancelled = true
		}
	}, [pdfUrl])

	// No QP uploaded → nothing to show. We deliberately keep the placeholder
	// visible if rendering fails — the dialog still works via the raw PDF URL.
	if (!jobId) return null

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				disabled={!pdfUrl}
				aria-label="Preview question paper"
				className={cn(
					"group relative h-24 w-[68px] shrink-0 overflow-hidden rounded-md border bg-muted/40 shadow-sm transition-shadow hover:shadow-md disabled:cursor-default disabled:hover:shadow-sm",
					className,
				)}
			>
				<canvas
					ref={canvasRef}
					className={cn(
						"absolute inset-0 h-full w-full object-cover transition-opacity",
						thumbReady ? "opacity-100" : "opacity-0",
					)}
				/>
				{!thumbReady && (
					<div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
						<FileText className="h-5 w-5" />
					</div>
				)}
			</button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-w-5xl w-full h-[90vh] flex flex-col p-0 gap-0">
					<DialogHeader className="px-4 py-3 border-b shrink-0">
						<DialogTitle className="text-base">Question paper</DialogTitle>
					</DialogHeader>
					<div className="flex-1 min-h-0">
						{pdfUrl ? (
							<iframe
								src={pdfUrl}
								className="w-full h-full border-0"
								title="Question paper"
							/>
						) : null}
					</div>
				</DialogContent>
			</Dialog>
		</>
	)
}

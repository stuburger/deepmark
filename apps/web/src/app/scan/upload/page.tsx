"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useRef, useState } from "react"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createScanUpload } from "@/lib/scan-actions"

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf"

async function pdfToJpegBlobs(file: File): Promise<Blob[]> {
	const pdfjsLib = await import("pdfjs-dist")
	const { getDocument, GlobalWorkerOptions } = pdfjsLib
	GlobalWorkerOptions.workerSrc = new URL(
		"pdfjs-dist/build/pdf.worker.min.mjs",
		import.meta.url,
	).toString()

	const arrayBuffer = await file.arrayBuffer()
	const pdf = await getDocument({ data: arrayBuffer }).promise

	const blobs: Blob[] = []
	for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
		const page = await pdf.getPage(pageNum)
		// 2× scale gives ~150 dpi for a typical A4 scan at 72 dpi viewport
		const viewport = page.getViewport({ scale: 2.0 })
		const canvas = document.createElement("canvas")
		canvas.width = viewport.width
		canvas.height = viewport.height
		const ctx = canvas.getContext("2d")
		if (!ctx) throw new Error("Could not get canvas context")
		await page.render({ canvasContext: ctx, viewport, canvas }).promise
		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
				"image/jpeg",
				0.92,
			)
		})
		blobs.push(blob)
	}
	return blobs
}

export default function ScanUploadPage() {
	const router = useRouter()
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [uploading, setUploading] = useState(false)
	const [progress, setProgress] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [drag, setDrag] = useState(false)

	const upload = useCallback(
		async (file: File) => {
			setError(null)
			setUploading(true)
			setProgress(null)
			try {
				let blobs: Blob[]
				let mimeType: "image/jpeg" | "image/png" | "image/webp"

				if (file.type === "application/pdf") {
					setProgress("Converting PDF pages to images…")
					blobs = await pdfToJpegBlobs(file)
					mimeType = "image/jpeg"
				} else {
					blobs = [file]
					mimeType =
						file.type === "image/png"
							? "image/png"
							: file.type === "image/webp"
								? "image/webp"
								: "image/jpeg"
				}

				setProgress(`Creating upload for ${blobs.length} page${blobs.length !== 1 ? "s" : ""}…`)
				const result = await createScanUpload(blobs.map(() => ({ mimeType })))
				if (!result.ok) {
					setError(result.error)
					return
				}

				for (let i = 0; i < result.presignedPutUrls.length; i++) {
					const entry = result.presignedPutUrls[i]
					if (!entry) continue
					setProgress(`Uploading page ${entry.pageNumber} of ${result.presignedPutUrls.length}…`)
					const blob = blobs[i]
					if (!blob) continue
					const res = await fetch(entry.url, {
						method: "PUT",
						body: blob,
						headers: { "Content-Type": mimeType },
					})
					if (!res.ok) {
						setError(`Upload failed on page ${entry.pageNumber}`)
						return
					}
				}

				router.push(`/scan/${result.submissionId}`)
			} catch (err) {
				setError(err instanceof Error ? err.message : "An unexpected error occurred")
			} finally {
				setUploading(false)
				setProgress(null)
			}
		},
		[router],
	)

	const onDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault()
			setDrag(false)
			const file = e.dataTransfer.files[0]
			if (file) upload(file)
		},
		[upload],
	)

	const onFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0]
			if (file) upload(file)
			e.target.value = ""
		},
		[upload],
	)

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-16">
			<Card>
				<CardHeader>
					<CardTitle>Upload handwritten test</CardTitle>
					<CardDescription>
						Upload a JPEG, PNG, WebP image or a multi-page PDF. PDFs are converted to images in
						your browser before uploading. OCR runs automatically.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div
						onDragOver={(e) => {
							e.preventDefault()
							setDrag(true)
						}}
						onDragLeave={() => setDrag(false)}
						onDrop={onDrop}
						className={`rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
							drag ? "border-primary bg-primary/5" : "border-muted-foreground/25"
						}`}
					>
						<input
							type="file"
							accept={ACCEPT}
							onChange={onFileSelect}
							disabled={uploading}
							className="sr-only"
							id="scan-file"
							ref={fileInputRef}
						/>
						<div className="cursor-pointer">
							<p className="mb-2 text-muted-foreground">
								{uploading
									? (progress ?? "Processing…")
									: "Drop an image or PDF here, or click to choose"}
							</p>
							<Button
								type="button"
								variant="secondary"
								disabled={uploading}
								onClick={() => fileInputRef.current?.click()}
							>
								Choose file
							</Button>
						</div>
					</div>
					{error && (
						<p className="text-sm text-destructive" role="alert">
							{error}
						</p>
					)}
				</CardContent>
			</Card>
			<div>
				<Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
					Back to dashboard
				</Link>
			</div>
		</main>
	)
}

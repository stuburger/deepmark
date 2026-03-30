"use client"

import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import {
	addPageToJob,
	createStudentPaperJob,
	reorderPages,
	triggerOcr,
} from "@/lib/mark-actions"
import { convertPdfToJpegs } from "@/lib/pdf-to-jpeg"
import { ArrowDown, ArrowUp, FileText, Trash2, Upload } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"

type PageItem = {
	order: number
	name: string
	mimeType: string
	key: string
	uploading: boolean
	error: string | null
}

export function UploadStudentScriptDialog({
	examPaperId,
	open,
	onOpenChange,
	onJobReady,
}: {
	examPaperId: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onJobReady?: (jobId: string) => void
}) {
	const router = useRouter()
	const fileInputRef = useRef<HTMLInputElement>(null)
	const jobIdRef = useRef<string | null>(null)

	const [pages, setPages] = useState<PageItem[]>([])
	const [converting, setConverting] = useState(false)
	const [submitting, setSubmitting] = useState(false)

	async function ensureJob(): Promise<string> {
		if (jobIdRef.current) return jobIdRef.current
		const result = await createStudentPaperJob(examPaperId)
		if (!result.ok) throw new Error(result.error)
		jobIdRef.current = result.jobId
		return result.jobId
	}

	async function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return

		// Expand any PDFs into per-page JPEGs so Cloud Vision can run on them
		// and bounding boxes can be overlaid in the results view.
		let expanded: File[] = []
		for (const file of Array.from(files)) {
			if (
				file.type === "application/pdf" ||
				file.name.toLowerCase().endsWith(".pdf")
			) {
				setConverting(true)
				try {
					const jpegs = await convertPdfToJpegs(file)
					expanded = expanded.concat(jpegs)
				} catch (err) {
					setConverting(false)
					toast.error(
						`Failed to convert PDF "${file.name}": ${err instanceof Error ? err.message : String(err)}`,
					)
					return
				}
				setConverting(false)
			} else {
				expanded.push(file)
			}
		}

		const startOrder = pages.length + 1
		const newItems: PageItem[] = expanded.map((file, i) => ({
			order: startOrder + i,
			name: file.name,
			mimeType: file.type,
			key: "",
			uploading: true,
			error: null,
		}))
		setPages((prev) => [...prev, ...newItems])

		// Create / retrieve the job (may be a network round-trip).
		let jid: string
		try {
			jid = await ensureJob()
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to create job"
			toast.error(msg)
			const newOrders = newItems.map((item) => item.order)
			setPages((prev) =>
				prev.map((p) =>
					newOrders.includes(p.order)
						? { ...p, uploading: false, error: msg }
						: p,
				),
			)
			return
		}

		for (let i = 0; i < expanded.length; i++) {
			const file = expanded[i]!
			const order = startOrder + i
			try {
				const result = await addPageToJob(jid, order, file.type)
				if (!result.ok) throw new Error(result.error)
				const putRes = await fetch(result.uploadUrl, {
					method: "PUT",
					body: file,
					headers: { "Content-Type": file.type },
				})
				if (!putRes.ok) throw new Error("Upload to storage failed")
				setPages((prev) =>
					prev.map((p) =>
						p.order === order ? { ...p, key: result.key, uploading: false } : p,
					),
				)
			} catch (err) {
				setPages((prev) =>
					prev.map((p) =>
						p.order === order
							? {
									...p,
									uploading: false,
									error: err instanceof Error ? err.message : "Upload failed",
								}
							: p,
					),
				)
			}
		}
	}

	async function handleRemove(order: number) {
		setPages((prev) =>
			prev
				.filter((p) => p.order !== order)
				.map((p, i) => ({ ...p, order: i + 1 })),
		)
	}

	async function handleMove(order: number, direction: "up" | "down") {
		const idx = pages.findIndex((p) => p.order === order)
		if (idx < 0) return
		const swapIdx = direction === "up" ? idx - 1 : idx + 1
		if (swapIdx < 0 || swapIdx >= pages.length) return

		const reordered = [...pages]
		;[reordered[idx], reordered[swapIdx]] = [
			reordered[swapIdx]!,
			reordered[idx]!,
		]
		const renumbered = reordered.map((p, i) => ({ ...p, order: i + 1 }))
		setPages(renumbered)

		const jid = jobIdRef.current
		const uploadedKeys = renumbered.filter((p) => p.key).map((p) => p.key)
		if (jid && uploadedKeys.length > 0) {
			await reorderPages(jid, uploadedKeys).catch(() => {})
		}
	}

	async function handleSubmit() {
		if (!jobIdRef.current) return
		setSubmitting(true)
		const result = await triggerOcr(jobIdRef.current)
		setSubmitting(false)
		if (!result.ok) {
			toast.error(result.error)
			return
		}
		if (onJobReady) {
			onJobReady(jobIdRef.current)
		} else {
			router.push(`/teacher/mark/${jobIdRef.current}`)
		}
	}

	function handleOpenChange(next: boolean) {
		if (submitting || converting) return
		if (!next) {
			setPages([])
			jobIdRef.current = null
		}
		onOpenChange(next)
	}

	const isUploading = pages.some((p) => p.uploading) || converting
	const hasErrors = pages.some((p) => p.error !== null)
	const canSubmit =
		pages.length > 0 && !isUploading && !hasErrors && !submitting

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Upload student script</DialogTitle>
					<DialogDescription>
						Upload the student&apos;s answer sheet as images or a PDF. PDFs are
						automatically converted to images so bounding boxes appear in
						results.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{/* Drop zone */}
					<button
						type="button"
						disabled={converting}
						onClick={() => fileInputRef.current?.click()}
						className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-6 py-8 text-center transition-colors hover:bg-muted/30 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{converting ? (
							<Spinner className="h-8 w-8 text-muted-foreground" />
						) : (
							<Upload className="h-8 w-8 text-muted-foreground" />
						)}
						<div>
							<p className="text-sm font-medium">
								{converting ? "Converting PDF…" : "Click to upload"}
							</p>
							<p className="text-xs text-muted-foreground mt-0.5">
								{converting
									? "Rendering pages to images"
									: "Images or PDF — multiple files supported"}
							</p>
						</div>
					</button>

					{/* Pages list */}
					{pages.length > 0 && (
						<div className="space-y-1.5 max-h-52 overflow-y-auto">
							{pages.map((page, idx) => (
								<div
									key={page.order}
									className="flex items-center gap-2.5 rounded-lg border bg-muted/20 px-3 py-2"
								>
									{page.uploading ? (
										<Spinner className="h-4 w-4 shrink-0 text-muted-foreground" />
									) : (
										<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
									)}
									<div className="flex-1 min-w-0">
										<p className="text-sm truncate">{page.name}</p>
										{page.error ? (
											<p className="text-xs text-destructive">{page.error}</p>
										) : page.uploading ? (
											<p className="text-xs text-muted-foreground">
												Uploading…
											</p>
										) : (
											<p className="text-xs text-muted-foreground">
												Page {idx + 1}
											</p>
										)}
									</div>
									{!page.uploading && pages.length > 1 && (
										<div className="flex flex-col gap-0.5 shrink-0">
											<button
												type="button"
												disabled={idx === 0}
												onClick={() => handleMove(page.order, "up")}
												className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
												aria-label="Move page up"
											>
												<ArrowUp className="h-3 w-3" />
											</button>
											<button
												type="button"
												disabled={idx === pages.length - 1}
												onClick={() => handleMove(page.order, "down")}
												className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
												aria-label="Move page down"
											>
												<ArrowDown className="h-3 w-3" />
											</button>
										</div>
									)}
									{!page.uploading && (
										<button
											type="button"
											onClick={() => handleRemove(page.order)}
											className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
											aria-label="Remove page"
										>
											<Trash2 className="h-3.5 w-3.5" />
										</button>
									)}
								</div>
							))}
						</div>
					)}

					<div className="flex gap-2">
						{pages.length > 0 && !isUploading && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="shrink-0"
								disabled={converting}
								onClick={() => fileInputRef.current?.click()}
							>
								+ Add more
							</Button>
						)}
						<Button
							className="flex-1"
							disabled={!canSubmit}
							onClick={handleSubmit}
						>
							{submitting ? (
								<>
									<Spinner className="h-4 w-4 mr-2" />
									Starting…
								</>
							) : converting ? (
								<>
									<Spinner className="h-4 w-4 mr-2" />
									Converting PDF…
								</>
							) : isUploading ? (
								<>
									<Spinner className="h-4 w-4 mr-2" />
									Uploading…
								</>
							) : (
								"Start marking"
							)}
						</Button>
					</div>
				</div>

				<input
					ref={fileInputRef}
					type="file"
					accept="image/*,application/pdf"
					multiple
					className="sr-only"
					onChange={(e) => {
						handleFiles(e.target.files)
						e.target.value = ""
					}}
				/>
			</DialogContent>
		</Dialog>
	)
}

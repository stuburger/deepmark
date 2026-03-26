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
	triggerOcr,
} from "@/lib/mark-actions"
import { FileText, Trash2, Upload } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

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
}: {
	examPaperId: string
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const router = useRouter()
	const fileInputRef = useRef<HTMLInputElement>(null)
	const jobIdRef = useRef<string | null>(null)

	const [pages, setPages] = useState<PageItem[]>([])
	const [submitting, setSubmitting] = useState(false)
	const [submitError, setSubmitError] = useState<string | null>(null)

	async function ensureJob(): Promise<string> {
		if (jobIdRef.current) return jobIdRef.current
		const result = await createStudentPaperJob(examPaperId)
		if (!result.ok) throw new Error(result.error)
		jobIdRef.current = result.jobId
		return result.jobId
	}

	async function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return

		let jid: string
		try {
			jid = await ensureJob()
		} catch (err) {
			setSubmitError(
				err instanceof Error ? err.message : "Failed to create job",
			)
			return
		}

		const startOrder = pages.length + 1
		const newItems: PageItem[] = []
		for (let i = 0; i < files.length; i++) {
			const file = files[i]!
			newItems.push({
				order: startOrder + i,
				name: file.name,
				mimeType: file.type || "application/pdf",
				key: "",
				uploading: true,
				error: null,
			})
		}
		setPages((prev) => [...prev, ...newItems])

		for (let i = 0; i < files.length; i++) {
			const file = files[i]!
			const order = startOrder + i
			const mimeType = file.type || "application/pdf"
			try {
				const result = await addPageToJob(jid, order, mimeType)
				if (!result.ok) throw new Error(result.error)
				const putRes = await fetch(result.uploadUrl, {
					method: "PUT",
					body: file,
					headers: { "Content-Type": mimeType },
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

	async function handleSubmit() {
		if (!jobIdRef.current) return
		setSubmitting(true)
		setSubmitError(null)
		const result = await triggerOcr(jobIdRef.current)
		setSubmitting(false)
		if (!result.ok) {
			setSubmitError(result.error)
			return
		}
		router.push(`/teacher/mark/${jobIdRef.current}`)
	}

	function handleOpenChange(next: boolean) {
		if (submitting) return
		if (!next) {
			setPages([])
			setSubmitError(null)
			jobIdRef.current = null
		}
		onOpenChange(next)
	}

	const isUploading = pages.some((p) => p.uploading)
	const hasErrors = pages.some((p) => p.error !== null)
	const canSubmit =
		pages.length > 0 && !isUploading && !hasErrors && !submitting

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Upload student script</DialogTitle>
					<DialogDescription>
						Upload the student&apos;s answer sheet as a PDF or images of each
						page. Both formats are supported.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{/* Drop zone */}
					<button
						type="button"
						onClick={() => fileInputRef.current?.click()}
						className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-6 py-8 text-center transition-colors hover:bg-muted/30 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<Upload className="h-8 w-8 text-muted-foreground" />
						<div>
							<p className="text-sm font-medium">Click to upload</p>
							<p className="text-xs text-muted-foreground mt-0.5">
								PDF or images (JPG, PNG) — multiple files supported
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

					{submitError && (
						<p className="text-sm text-destructive">{submitError}</p>
					)}

					<div className="flex gap-2">
						{pages.length > 0 && !isUploading && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="shrink-0"
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

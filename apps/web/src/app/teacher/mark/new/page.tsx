"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
	type CatalogExamPaper,
	listCatalogExamPapers,
} from "@/lib/dashboard-actions"
import {
	addPageToJob,
	createStudentPaperJob,
	removePageFromJob,
	reorderPages,
	triggerOcr,
} from "@/lib/mark-actions"
import {
	AlertCircle,
	ArrowDown,
	ArrowUp,
	Camera,
	CheckCircle2,
	FileText,
	Search,
	Trash2,
	Upload,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

type PageItem = {
	key: string
	order: number
	mimeType: string
	previewUrl: string | null
	uploading: boolean
	error: string | null
}

function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1)
}

function subjectColor(subject: string) {
	switch (subject) {
		case "biology":
			return "secondary" as const
		case "chemistry":
			return "default" as const
		case "physics":
			return "outline" as const
		case "english":
			return "secondary" as const
		default:
			return "outline" as const
	}
}

function PageThumbnail({
	page,
	index,
	total,
	onMoveUp,
	onMoveDown,
	onRemove,
}: {
	page: PageItem
	index: number
	total: number
	onMoveUp: () => void
	onMoveDown: () => void
	onRemove: () => void
}) {
	const isImage = page.mimeType.startsWith("image/")
	return (
		<div className="flex items-center gap-3 rounded-xl border bg-card p-3">
			<div className="h-16 w-12 shrink-0 rounded-md border overflow-hidden bg-muted flex items-center justify-center">
				{page.uploading ? (
					<Spinner className="h-5 w-5" />
				) : isImage && page.previewUrl ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={page.previewUrl}
						alt={`Page ${page.order}`}
						className="h-full w-full object-cover"
					/>
				) : (
					<FileText className="h-6 w-6 text-muted-foreground" />
				)}
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium">Page {index + 1}</p>
				{page.error && (
					<p className="text-xs text-destructive mt-0.5">{page.error}</p>
				)}
				{page.uploading && (
					<p className="text-xs text-muted-foreground mt-0.5">Uploading…</p>
				)}
			</div>
			<div className="flex flex-col gap-1">
				<button
					type="button"
					disabled={index === 0}
					onClick={onMoveUp}
					className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"
					aria-label="Move up"
				>
					<ArrowUp className="h-4 w-4" />
				</button>
				<button
					type="button"
					disabled={index === total - 1}
					onClick={onMoveDown}
					className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"
					aria-label="Move down"
				>
					<ArrowDown className="h-4 w-4" />
				</button>
			</div>
			<button
				type="button"
				onClick={onRemove}
				className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
				aria-label="Remove page"
			>
				<Trash2 className="h-4 w-4" />
			</button>
		</div>
	)
}

export default function MarkNewPage() {
	const router = useRouter()

	const cameraInputRef = useRef<HTMLInputElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const [pages, setPages] = useState<PageItem[]>([])
	const [ocrError, setOcrError] = useState<string | null>(null)

	const [preSelectedPaper, setPreSelectedPaper] =
		useState<CatalogExamPaper | null>(null)
	const [preSelectSearch, setPreSelectSearch] = useState("")
	const [preSelectPapers, setPreSelectPapers] = useState<CatalogExamPaper[]>([])
	const [loadingPreSelectPapers, setLoadingPreSelectPapers] = useState(false)

	// Ensure job is created once
	const jobIdRef = useRef<string | null>(null)

	async function ensureJob(): Promise<string> {
		if (jobIdRef.current) return jobIdRef.current
		const result = await createStudentPaperJob()
		if (!result.ok) throw new Error(result.error)
		jobIdRef.current = result.jobId
		return result.jobId
	}

	async function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return
		const jid = await ensureJob()

		const newItems: PageItem[] = []
		const startOrder = pages.length + 1

		for (let i = 0; i < files.length; i++) {
			const file = files[i]
			if (!file) continue
			const order = startOrder + i
			const mimeType = file.type || "application/pdf"
			const previewUrl = mimeType.startsWith("image/")
				? URL.createObjectURL(file)
				: null

			const item: PageItem = {
				key: "",
				order,
				mimeType,
				previewUrl,
				uploading: true,
				error: null,
			}
			newItems.push(item)
		}

		setPages((prev) => [...prev, ...newItems])

		// Upload each file
		for (let i = 0; i < files.length; i++) {
			const file = files[i]
			if (!file) continue
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
				if (!putRes.ok) throw new Error("Upload failed")

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

	function movePage(index: number, direction: "up" | "down") {
		setPages((prev) => {
			const next = [...prev]
			const swapIndex = direction === "up" ? index - 1 : index + 1
			if (swapIndex < 0 || swapIndex >= next.length) return prev
			;[next[index], next[swapIndex]] = [next[swapIndex]!, next[index]!]
			const reordered = next.map((p, i) => ({ ...p, order: i + 1 }))
			// Persist to server async
			if (jobIdRef.current) {
				reorderPages(
					jobIdRef.current,
					reordered.map((p) => p.key).filter(Boolean),
				).catch(() => {})
			}
			return reordered
		})
	}

	async function handleRemovePage(index: number) {
		const page = pages[index]
		if (!page || !jobIdRef.current) return
		await removePageFromJob(jobIdRef.current, page.order)
		if (page.previewUrl) URL.revokeObjectURL(page.previewUrl)
		setPages((prev) => {
			const next = prev.filter((_, i) => i !== index)
			return next.map((p, i) => ({ ...p, order: i + 1 }))
		})
	}

	const isUploading = pages.some((p) => p.uploading)
	const hasErrors = pages.some((p) => p.error)
	const readyToProcess =
		pages.length > 0 && !isUploading && !hasErrors && preSelectedPaper !== null

	async function handleTriggerOcr() {
		if (!jobIdRef.current || !preSelectedPaper) return
		setOcrError(null)
		const result = await triggerOcr(jobIdRef.current, preSelectedPaper.id)
		if (!result.ok) {
			setOcrError(result.error)
			return
		}
		router.push(`/teacher/mark/${jobIdRef.current}`)
	}

	useEffect(() => {
		if (preSelectPapers.length > 0 || loadingPreSelectPapers) return
		setLoadingPreSelectPapers(true)
		listCatalogExamPapers().then((r) => {
			if (r.ok) setPreSelectPapers(r.papers)
			setLoadingPreSelectPapers(false)
		})
	}, [preSelectPapers.length, loadingPreSelectPapers])

	return (
		<div className="flex flex-col min-h-[calc(100dvh-4rem)] max-w-lg mx-auto">
			{/* Content */}
			<div className="flex-1 px-4 pt-4 pb-32 space-y-5">
				{/* Header */}
				<div>
					<h1 className="text-2xl font-semibold">Mark a paper</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Photograph or upload each page of the student&apos;s answer sheet.
					</p>
				</div>

				<>
					{/* Upload buttons */}
					<div className="grid grid-cols-2 gap-3">
						<button
							type="button"
							onClick={() => cameraInputRef.current?.click()}
							className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-input bg-card p-6 text-center active:bg-muted transition-colors"
						>
							<Camera className="h-8 w-8 text-muted-foreground" />
							<span className="text-sm font-medium">Take photo</span>
							<span className="text-xs text-muted-foreground">
								Opens camera
							</span>
						</button>
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-input bg-card p-6 text-center active:bg-muted transition-colors"
						>
							<Upload className="h-8 w-8 text-muted-foreground" />
							<span className="text-sm font-medium">Upload file</span>
							<span className="text-xs text-muted-foreground">
								PDF or image
							</span>
						</button>
					</div>

					{/* Hidden inputs */}
					<input
						ref={cameraInputRef}
						type="file"
						accept="image/*"
						capture="environment"
						multiple
						className="sr-only"
						onChange={(e) => handleFiles(e.target.files)}
					/>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/*,application/pdf"
						multiple
						className="sr-only"
						onChange={(e) => handleFiles(e.target.files)}
					/>

					{/* Pages list */}
					{pages.length > 0 && (
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<p className="text-sm font-medium text-muted-foreground">
									{pages.length} page{pages.length !== 1 ? "s" : ""} added
								</p>
								<button
									type="button"
									onClick={() => fileInputRef.current?.click()}
									className="text-xs text-primary font-medium"
								>
									+ Add more
								</button>
							</div>
							<div className="space-y-2">
								{pages.map((page, index) => (
									<PageThumbnail
										key={page.order}
										page={page}
										index={index}
										total={pages.length}
										onMoveUp={() => movePage(index, "up")}
										onMoveDown={() => movePage(index, "down")}
										onRemove={() => handleRemovePage(index)}
									/>
								))}
							</div>
						</div>
					)}

					{/* Exam paper — required */}
					{preSelectedPaper ? (
						<div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
							<CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
							<div className="flex-1 min-w-0">
								<p className="text-xs text-muted-foreground">Exam paper</p>
								<p className="text-sm font-medium truncate">
									{preSelectedPaper.title}
								</p>
							</div>
							<button
								type="button"
								onClick={() => setPreSelectedPaper(null)}
								className="text-xs text-muted-foreground hover:text-foreground"
								aria-label="Change exam paper"
							>
								Change
							</button>
						</div>
					) : (
						<div className="space-y-2">
							<p className="text-sm font-medium">Select exam paper</p>
							<div className="relative">
								<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									className="pl-9"
									placeholder="Search papers…"
									value={preSelectSearch}
									onChange={(e) => setPreSelectSearch(e.target.value)}
								/>
							</div>
							{loadingPreSelectPapers ? (
								<p className="py-3 text-center text-sm text-muted-foreground">
									Loading papers…
								</p>
							) : (
								<div className="max-h-72 overflow-y-auto space-y-1.5">
									{preSelectPapers
										.filter((p) => {
											if (!preSelectSearch.trim()) return true
											const q = preSelectSearch.toLowerCase()
											return (
												p.title.toLowerCase().includes(q) ||
												p.subject.toLowerCase().includes(q) ||
												(p.exam_board ?? "").toLowerCase().includes(q) ||
												String(p.year).includes(q)
											)
										})
										.map((paper) => (
											<button
												key={paper.id}
												type="button"
												disabled={!paper.has_mark_scheme}
												onClick={() => setPreSelectedPaper(paper)}
												className="w-full rounded-xl border bg-card p-3 text-left transition-colors enabled:active:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
											>
												<div className="flex items-start justify-between gap-2">
													<p className="text-sm font-medium leading-tight">
														{paper.title}
													</p>
													{!paper.has_mark_scheme && (
														<span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 shrink-0">
															<AlertCircle className="h-3.5 w-3.5" />
															No mark scheme
														</span>
													)}
												</div>
												<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
													<Badge
														variant={subjectColor(paper.subject)}
														className="text-xs"
													>
														{capitalize(paper.subject)}
													</Badge>
													{paper.exam_board && <span>{paper.exam_board}</span>}
													<span>{paper.year}</span>
													<span>{paper.total_marks} marks</span>
												</div>
											</button>
										))}
								</div>
							)}
						</div>
					)}

					{ocrError && <p className="text-sm text-destructive">{ocrError}</p>}
				</>
			</div>

			{/* Sticky bottom CTA */}
			<div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur px-4 py-4 safe-area-inset-bottom">
				<div className="max-w-lg mx-auto">
					<Button
						className="w-full h-14 text-base rounded-xl"
						disabled={!readyToProcess}
						onClick={handleTriggerOcr}
					>
						{isUploading ? (
							<>
								<Spinner className="mr-2 h-4 w-4" />
								Uploading…
							</>
						) : (
							"Extract answers"
						)}
					</Button>
				</div>
			</div>
		</div>
	)
}

"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import {
	addFileToBatch,
	commitBatch,
	createBatchMarkingJob,
	deleteStagedScript,
	getBatchMarkingJob,
	getStagedScriptPageUrls,
	triggerClassification,
	updateBatchJobSettings,
	updateStagedScript,
	updateStagedScriptPageKeys,
} from "@/lib/batch-actions"
import type { BatchMarkingJobData } from "@/lib/batch-actions"
import {
	DndContext,
	DragOverlay,
	PointerSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core"
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core"
import { arrayMove } from "@dnd-kit/sortable"
import {
	CheckCircle2,
	ChevronDown,
	FileText,
	GripVertical,
	Loader2,
	Trash2,
	Upload,
	X,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { PageItem } from "./staged-script-page-editor"
import { PageCarousel } from "./staged-script-page-editor"

type Phase = "upload" | "classifying" | "staging" | "marking" | "done"

type FileItem = {
	name: string
	mimeType: string
	uploading: boolean
	error: string | null
}

function confidenceColor(confidence: number | null): string {
	if (confidence === null) return "secondary"
	if (confidence >= 0.9) return "default"
	if (confidence >= 0.7) return "outline"
	return "destructive"
}

function confidenceLabel(confidence: number | null): string {
	if (confidence === null) return "—"
	return (Math.round(confidence * 10) / 10).toFixed(1)
}

export function BatchMarkingDialog({
	examPaperId,
	open,
	onOpenChange,
}: {
	examPaperId: string
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const [phase, setPhase] = useState<Phase>("upload")
	const [files, setFiles] = useState<FileItem[]>([])
	const [batchJobId, setBatchJobId] = useState<string | null>(null)
	const [batchData, setBatchData] = useState<BatchMarkingJobData | null>(null)
	const [committing, setCommitting] = useState(false)
	const [showAdvanced, setShowAdvanced] = useState(false)
	const [autoCommit, setAutoCommit] = useState(false)
	const [blankPageMode, setBlankPageMode] = useState<
		"script_page" | "separator"
	>("script_page")
	const [pagesPerScript, setPagesPerScript] = useState(4)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

	// Reset on close
	function handleOpenChange(next: boolean) {
		if (!next) {
			stopPolling()
			setPhase("upload")
			setFiles([])
			setBatchJobId(null)
			setBatchData(null)
			setShowAdvanced(false)
			setAutoCommit(false)
			setBlankPageMode("script_page")
			setPagesPerScript(4)
		}
		onOpenChange(next)
	}

	// ── Polling ──────────────────────────────────────────────────────────────

	function startPolling(jobId: string) {
		stopPolling()
		pollRef.current = setInterval(async () => {
			const result = await getBatchMarkingJob(jobId)
			if (!result.ok) return
			setBatchData(result.batch)

			if (result.batch.status === "staging") {
				setPhase("staging")
				stopPolling()
			} else if (result.batch.status === "marking") {
				setPhase("marking")
				const complete = result.batch.student_jobs.filter(
					(j) => j.status === "ocr_complete",
				).length
				if (
					complete >= result.batch.total_student_jobs &&
					result.batch.total_student_jobs > 0
				) {
					setPhase("done")
					stopPolling()
				}
			} else if (result.batch.status === "complete") {
				setPhase("done")
				stopPolling()
			} else if (result.batch.status === "failed") {
				stopPolling()
				toast.error(result.batch.error ?? "Classification failed")
			}
		}, 3000)
	}

	function stopPolling() {
		if (pollRef.current) {
			clearInterval(pollRef.current)
			pollRef.current = null
		}
	}

	useEffect(() => {
		return () => stopPolling()
	}, [])

	// ── Upload phase ──────────────────────────────────────────────────────────

	async function ensureBatchJob(): Promise<string> {
		if (batchJobId) return batchJobId
		const result = await createBatchMarkingJob(
			examPaperId,
			autoCommit ? "auto" : "required",
			blankPageMode,
			pagesPerScript,
		)
		if (!result.ok) throw new Error(result.error)
		setBatchJobId(result.batchJobId)
		return result.batchJobId
	}

	async function handleFiles(fileList: FileList | null) {
		if (!fileList || fileList.length === 0) return
		const incoming = Array.from(fileList)

		const newItems: FileItem[] = incoming.map((f) => ({
			name: f.name,
			mimeType: f.type || "application/octet-stream",
			uploading: true,
			error: null,
		}))
		setFiles((prev) => [...prev, ...newItems])

		let jid: string
		try {
			jid = await ensureBatchJob()
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to create batch"
			toast.error(msg)
			setFiles((prev) =>
				prev.map((item) =>
					newItems.some((n) => n.name === item.name)
						? { ...item, uploading: false, error: msg }
						: item,
				),
			)
			return
		}

		for (const file of incoming) {
			try {
				const result = await addFileToBatch(
					jid,
					file.name,
					file.type || "application/octet-stream",
				)
				if (!result.ok) throw new Error(result.error)
				const putRes = await fetch(result.uploadUrl, {
					method: "PUT",
					body: file,
					headers: { "Content-Type": file.type || "application/octet-stream" },
				})
				if (!putRes.ok) throw new Error("Upload to storage failed")
				setFiles((prev) =>
					prev.map((item) =>
						item.name === file.name ? { ...item, uploading: false } : item,
					),
				)
			} catch (err) {
				const msg = err instanceof Error ? err.message : "Upload failed"
				setFiles((prev) =>
					prev.map((item) =>
						item.name === file.name
							? { ...item, uploading: false, error: msg }
							: item,
					),
				)
			}
		}
	}

	async function handleStartClassifying() {
		if (!batchJobId) return
		setPhase("classifying")
		const result = await triggerClassification(batchJobId)
		if (!result.ok) {
			toast.error(result.error)
			setPhase("upload")
			return
		}
		startPolling(batchJobId)
	}

	// ── Staging phase ─────────────────────────────────────────────────────────

	async function handleUpdateName(scriptId: string, name: string) {
		await updateStagedScript(scriptId, { confirmedName: name })
	}

	async function handleToggleExclude(scriptId: string, currentStatus: string) {
		const newStatus = currentStatus === "excluded" ? "confirmed" : "excluded"
		await updateStagedScript(scriptId, {
			status: newStatus as "confirmed" | "excluded",
		})
		if (batchJobId) {
			const result = await getBatchMarkingJob(batchJobId)
			if (result.ok) setBatchData(result.batch)
		}
	}

	async function handleConfirmAll() {
		if (!batchJobId || !batchData) return
		const proposed = batchData.staged_scripts.filter(
			(s) => s.status === "proposed",
		)
		for (const script of proposed) {
			await updateStagedScript(script.id, { status: "confirmed" })
		}
		const result = await getBatchMarkingJob(batchJobId)
		if (result.ok) setBatchData(result.batch)
	}

	async function handleCommit() {
		if (!batchJobId) return
		setCommitting(true)
		const result = await commitBatch(batchJobId)
		setCommitting(false)
		if (!result.ok) {
			toast.error(result.error)
			return
		}
		setPhase("marking")
		startPolling(batchJobId)
	}

	// ── Render ────────────────────────────────────────────────────────────────

	const isUploading = files.some((f) => f.uploading)
	const hasErrors = files.some((f) => f.error !== null)
	const canStart = files.length > 0 && !isUploading && !hasErrors

	const confirmedCount =
		batchData?.staged_scripts.filter((s) => s.status === "confirmed").length ??
		0
	const proposedCount =
		batchData?.staged_scripts.filter((s) => s.status === "proposed").length ?? 0
	const totalJobs = batchData?.total_student_jobs ?? 0
	const completeJobs =
		batchData?.student_jobs.filter((j) => j.status === "ocr_complete").length ??
		0

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				className={
					phase === "staging"
						? "sm:max-w-4xl max-h-[90vh] overflow-y-auto"
						: "max-w-lg"
				}
			>
				{/* ── Phase 1: Upload ── */}
				{phase === "upload" && (
					<>
						<DialogHeader>
							<DialogTitle>Upload class batch</DialogTitle>
							<DialogDescription>
								Upload PDFs or images for the whole class. Each file can be a
								single student&apos;s script or a multi-student bulk scan.
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-4">
							<button
								type="button"
								onClick={() => fileInputRef.current?.click()}
								className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-6 py-8 text-center transition-colors hover:bg-muted/30 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<Upload className="h-8 w-8 text-muted-foreground" />
								<div>
									<p className="text-sm font-medium">Click to upload</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										PDFs and images — multiple files supported
									</p>
								</div>
							</button>

							{files.length > 0 && (
								<div className="space-y-1.5 max-h-52 overflow-y-auto">
									{files.map((file) => (
										<div
											key={file.name}
											className="flex items-center gap-2.5 rounded-lg border bg-muted/20 px-3 py-2"
										>
											{file.uploading ? (
												<Spinner className="h-4 w-4 shrink-0 text-muted-foreground" />
											) : (
												<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
											)}
											<div className="flex-1 min-w-0">
												<p className="text-sm truncate">{file.name}</p>
												{file.error ? (
													<p className="text-xs text-destructive">
														{file.error}
													</p>
												) : file.uploading ? (
													<p className="text-xs text-muted-foreground">
														Uploading…
													</p>
												) : (
													<p className="text-xs text-muted-foreground">Ready</p>
												)}
											</div>
											{!file.uploading && (
												<button
													type="button"
													onClick={() =>
														setFiles((prev) =>
															prev.filter((f) => f.name !== file.name),
														)
													}
													className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
												>
													<Trash2 className="h-3.5 w-3.5" />
												</button>
											)}
										</div>
									))}
								</div>
							)}
						</div>

						{/* Advanced settings */}
						<div>
							<button
								type="button"
								onClick={() => setShowAdvanced((v) => !v)}
								className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
							>
								<ChevronDown
									className={`h-3.5 w-3.5 transition-transform ${
										showAdvanced ? "rotate-180" : ""
									}`}
								/>
								Advanced
							</button>
							{showAdvanced && (
								<div className="mt-3 space-y-4 rounded-lg border bg-muted/20 p-4">
									<div className="flex items-center justify-between gap-4">
										<div className="space-y-0.5">
											<p className="text-sm font-medium">Auto-start marking</p>
											<p className="text-xs text-muted-foreground">
												When on, skip review if all scripts are detected with
												high confidence (≥ 0.9). When off, always review before
												marking.
											</p>
										</div>
										<button
											type="button"
											role="switch"
											aria-checked={autoCommit}
											disabled={phase !== "upload"}
											onClick={() => {
												const next = !autoCommit
												setAutoCommit(next)
												if (batchJobId) {
													void updateBatchJobSettings(batchJobId, {
														reviewMode: next ? "auto" : "required",
													})
												}
											}}
											className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
												autoCommit ? "bg-primary" : "bg-input"
											}`}
										>
											<span
												className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
													autoCommit ? "translate-x-4" : "translate-x-0"
												}`}
											/>
										</button>
									</div>
									<div className="space-y-1.5">
										<label
											htmlFor="pages-per-script"
											className="text-sm font-medium"
										>
											Approx. pages per student script
										</label>
										<Input
											id="pages-per-script"
											type="number"
											min={1}
											max={20}
											value={pagesPerScript}
											onChange={(e) => {
												const next = Math.min(
													20,
													Math.max(1, Number(e.target.value)),
												)
												setPagesPerScript(next)
												if (batchJobId) {
													void updateBatchJobSettings(batchJobId, {
														pagesPerScript: next,
													})
												}
											}}
											className="h-8 w-24 text-sm"
											disabled={phase !== "upload"}
										/>
									</div>
									<div className="flex items-center justify-between gap-4">
										<div className="space-y-0.5">
											<p className="text-sm font-medium">
												Treat blank pages as script separators
											</p>
											<p className="text-xs text-muted-foreground">
												When on, blank pages split between students. When off,
												blank pages are classified by context.
											</p>
										</div>
										<button
											type="button"
											role="switch"
											aria-checked={blankPageMode === "separator"}
											disabled={phase !== "upload"}
											onClick={() => {
												const next =
													blankPageMode === "separator"
														? "script_page"
														: "separator"
												setBlankPageMode(next)
												if (batchJobId) {
													void updateBatchJobSettings(batchJobId, {
														blankPageMode: next,
													})
												}
											}}
											className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
												blankPageMode === "separator"
													? "bg-primary"
													: "bg-input"
											}`}
										>
											<span
												className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
													blankPageMode === "separator"
														? "translate-x-4"
														: "translate-x-0"
												}`}
											/>
										</button>
									</div>
								</div>
							)}
						</div>

						<DialogFooter>
							{files.length > 0 && !isUploading && (
								<Button
									variant="outline"
									size="sm"
									onClick={() => fileInputRef.current?.click()}
								>
									+ Add more
								</Button>
							)}
							<Button disabled={!canStart} onClick={handleStartClassifying}>
								{isUploading ? (
									<>
										<Spinner className="h-4 w-4 mr-2" />
										Uploading…
									</>
								) : (
									"Analyse scripts"
								)}
							</Button>
						</DialogFooter>
					</>
				)}

				{/* ── Phase 2: Classifying ── */}
				{phase === "classifying" && (
					<>
						<DialogHeader>
							<DialogTitle>Analysing your upload</DialogTitle>
							<DialogDescription>
								Gemini is reading and grouping the scripts by student. This
								usually takes under a minute.
							</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col items-center gap-4 py-8">
							<Loader2 className="h-10 w-10 animate-spin text-primary" />
							<p className="text-sm text-muted-foreground">
								Analysing your upload…
							</p>
						</div>
						<DialogFooter>
							<Button variant="ghost" onClick={() => handleOpenChange(false)}>
								Cancel
							</Button>
						</DialogFooter>
					</>
				)}

				{/* ── Phase 3: Staging ── */}
				{phase === "staging" && batchData && (
					<>
						<DialogHeader>
							<DialogTitle>Review detected scripts</DialogTitle>
							<DialogDescription>
								{batchData.staged_scripts.length} script
								{batchData.staged_scripts.length === 1 ? "" : "s"} detected.
								Confirm names before marking.
								{proposedCount > 0 && (
									<span className="ml-1 text-amber-600 font-medium">
										{proposedCount} still need review.
									</span>
								)}
							</DialogDescription>
						</DialogHeader>

						{proposedCount > 0 && (
							<div className="flex justify-end">
								<Button variant="outline" size="sm" onClick={handleConfirmAll}>
									Confirm all
								</Button>
							</div>
						)}

						<StagedScriptReviewCards
							batchId={batchJobId ?? ""}
							scripts={batchData.staged_scripts}
							onUpdateName={handleUpdateName}
							onToggleExclude={handleToggleExclude}
							onDeleteScript={async () => {
								if (batchJobId) {
									const result = await getBatchMarkingJob(batchJobId)
									if (result.ok) setBatchData(result.batch)
								}
							}}
						/>

						{confirmedCount > 0 && (
							<DialogFooter>
								<Button
									disabled={committing || proposedCount > 0}
									onClick={handleCommit}
								>
									{committing ? (
										<>
											<Spinner className="h-4 w-4 mr-2" />
											Starting…
										</>
									) : (
										`Start marking ${confirmedCount} script${
											confirmedCount === 1 ? "" : "s"
										}`
									)}
								</Button>
							</DialogFooter>
						)}
					</>
				)}

				{/* ── Phase 4: Marking ── */}
				{phase === "marking" && (
					<>
						<DialogHeader>
							<DialogTitle>Marking in progress</DialogTitle>
							<DialogDescription>
								Scripts are being OCR&apos;d and graded in the background. You
								can close this dialog — the Submissions tab will show progress.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-4 py-2">
							{totalJobs > 0 && (
								<div className="space-y-2">
									<div className="flex justify-between text-sm">
										<span className="text-muted-foreground">
											{completeJobs} of {totalJobs} complete
										</span>
										<span className="text-muted-foreground">
											{Math.round((completeJobs / totalJobs) * 100)}%
										</span>
									</div>
									<Progress value={(completeJobs / totalJobs) * 100} />
								</div>
							)}
							<p className="text-sm text-muted-foreground">
								You&apos;ll get a browser notification when all scripts are
								done.
							</p>
							<Link
								href={`/teacher/mark/papers/${examPaperId}`}
								className="text-sm text-primary underline underline-offset-4"
							>
								View results →
							</Link>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={() => handleOpenChange(false)}>
								Close
							</Button>
						</DialogFooter>
					</>
				)}

				{/* ── Phase 5: Done ── */}
				{phase === "done" && batchData && (
					<>
						<DialogHeader>
							<DialogTitle>Marking complete</DialogTitle>
							<DialogDescription>
								All scripts in this batch have been marked.
							</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col items-center gap-3 py-6">
							<CheckCircle2 className="h-12 w-12 text-green-500" />
							<p className="text-sm font-medium">
								{totalJobs} script{totalJobs === 1 ? "" : "s"} marked
							</p>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={() => handleOpenChange(false)}>
								Close
							</Button>
							<Link
								href={`/teacher/mark/papers/${examPaperId}`}
								className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
							>
								View all results →
							</Link>
						</DialogFooter>
					</>
				)}

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

// ── Shared StagedScriptReviewCards ──────────────────────────────────────────

type StagedScriptCardProps = {
	batchId: string
	scripts: BatchMarkingJobData["staged_scripts"]
	onUpdateName: (scriptId: string, name: string) => void
	onToggleExclude: (scriptId: string, currentStatus: string) => void
	onDeleteScript?: (scriptId: string) => void
}

type PageKeyRaw = {
	s3_key: string
	order: number
	mime_type: string
	source_file: string
}

type CarouselState = {
	pages: PageItem[]
	index: number
	scriptName: string
}

type ActiveDragState = {
	key: string
	url: string
}

// ── Draggable + droppable page thumbnail ──────────────────────────────────────

function DraggablePageThumb({
	pageKey,
	url,
	index,
	isDragging,
	onLightbox,
}: {
	pageKey: string
	url: string | undefined
	index: number
	isDragging: boolean
	onLightbox: () => void
}) {
	const {
		attributes,
		listeners,
		setNodeRef: setDragRef,
	} = useDraggable({ id: pageKey })
	const { setNodeRef: setDropRef, isOver } = useDroppable({ id: pageKey })

	const setRef = useCallback(
		(el: HTMLElement | null) => {
			setDragRef(el)
			setDropRef(el)
		},
		[setDragRef, setDropRef],
	)

	return (
		<div
			ref={setRef}
			className={`relative group shrink-0 rounded overflow-hidden border bg-muted/40 transition-all ${
				isDragging ? "opacity-40" : ""
			} ${isOver && !isDragging ? "ring-2 ring-primary scale-105" : ""}`}
		>
			{/* Drag handle */}
			<div
				{...listeners}
				{...attributes}
				className="absolute inset-x-0 top-0 h-4 flex items-center justify-center cursor-grab active:cursor-grabbing bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity z-10"
				title="Drag to reorder or move to another script"
			>
				<GripVertical className="h-3 w-3 text-white" />
			</div>

			<button
				type="button"
				onClick={onLightbox}
				disabled={!url}
				className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
				title={`Page ${index + 1} — click to enlarge`}
			>
				{url ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={url}
						alt={`Page ${index + 1}`}
						draggable={false}
						className="w-14 h-20 object-cover"
					/>
				) : (
					<div className="w-14 h-20 flex items-center justify-center">
						<FileText className="h-5 w-5 text-muted-foreground/40" />
					</div>
				)}
			</button>

			<span className="absolute bottom-0.5 right-0.5 text-[9px] leading-none px-0.5 py-px rounded bg-black/50 text-white tabular-nums pointer-events-none">
				{index + 1}
			</span>
		</div>
	)
}

// ── Script card with droppable zone ──────────────────────────────────────────

function DndScriptCard({
	script,
	localNames,
	urls,
	activeDragKey,
	onOpenCarousel,
	onUpdateLocalName,
	onUpdateName,
	onToggleExclude,
	onDelete,
}: {
	script: BatchMarkingJobData["staged_scripts"][number]
	localNames: Record<string, string>
	urls: Record<string, string>
	activeDragKey: string | null
	onOpenCarousel: (
		script: BatchMarkingJobData["staged_scripts"][number],
		idx: number,
	) => void
	onUpdateLocalName: (id: string, value: string) => void
	onUpdateName: (id: string, name: string) => void
	onToggleExclude: (id: string, status: string) => void
	onDelete: (id: string) => void
}) {
	const { setNodeRef, isOver } = useDroppable({ id: script.id })

	const pageKeys = (script.page_keys as PageKeyRaw[])
		.slice()
		.sort((a, b) => a.order - b.order)

	const isDraggingOtherSource =
		activeDragKey !== null &&
		!pageKeys.some((pk) => pk.s3_key === activeDragKey)

	return (
		<Card className={script.status === "excluded" ? "opacity-50" : undefined}>
			<CardContent className="p-4 space-y-3">
				<div className="space-y-1">
					<p className="text-xs text-muted-foreground">Student name</p>
					<Input
						value={localNames[script.id] ?? ""}
						onChange={(e) => onUpdateLocalName(script.id, e.target.value)}
						onBlur={() => onUpdateName(script.id, localNames[script.id] ?? "")}
						placeholder="Enter student name"
						className="h-8 text-sm"
						disabled={script.status === "excluded"}
					/>
				</div>

				<div className="flex items-center justify-between gap-2">
					<Badge
						variant={
							confidenceColor(script.confidence) as
								| "default"
								| "destructive"
								| "outline"
								| "secondary"
						}
					>
						{confidenceLabel(script.confidence)}
					</Badge>
					<Badge
						variant={
							script.status === "confirmed"
								? "default"
								: script.status === "excluded"
									? "destructive"
									: "secondary"
						}
					>
						{script.status}
					</Badge>
				</div>

				{/* ── Page thumbnails — droppable zone ── */}
				<div
					ref={setNodeRef}
					className={`flex gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5 min-h-21 rounded-lg transition-colors ${
						isOver && isDraggingOtherSource
							? "ring-2 ring-primary/30 bg-primary/5"
							: ""
					}`}
				>
					{pageKeys.length === 0 ? (
						<div
							className={`flex items-center justify-center w-full h-20 rounded-lg border-2 border-dashed text-xs text-muted-foreground ${
								isOver && isDraggingOtherSource
									? "border-primary text-primary"
									: "border-muted"
							}`}
						>
							{isOver && isDraggingOtherSource ? "Drop here" : "No pages"}
						</div>
					) : (
						<>
							{pageKeys.map((pk, idx) => (
								<DraggablePageThumb
									key={pk.s3_key}
									pageKey={pk.s3_key}
									url={urls[pk.s3_key]}
									index={idx}
									isDragging={activeDragKey === pk.s3_key}
									onLightbox={() => onOpenCarousel(script, idx)}
								/>
							))}
							{!pageKeys.some((pk) => urls[pk.s3_key]) && (
								<p className="text-xs text-muted-foreground self-center pl-1">
									Loading…
								</p>
							)}
						</>
					)}
				</div>

				<div className="flex items-center justify-between text-xs text-muted-foreground">
					<span>
						{pageKeys.length} page{pageKeys.length === 1 ? "" : "s"}
					</span>
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={() => onToggleExclude(script.id, script.status)}
							className="flex items-center gap-1 hover:text-foreground transition-colors"
						>
							<X className="h-3 w-3" />
							{script.status === "excluded" ? "Restore" : "Exclude"}
						</button>
						<button
							type="button"
							onClick={() => onDelete(script.id)}
							className="flex items-center gap-1 hover:text-destructive transition-colors"
						>
							<Trash2 className="h-3 w-3" />
							Delete
						</button>
					</div>
				</div>
			</CardContent>
		</Card>
	)
}

// ── Main StagedScriptReviewCards ─────────────────────────────────────────────

export function StagedScriptReviewCards({
	batchId,
	scripts,
	onUpdateName,
	onToggleExclude,
	onDeleteScript,
}: StagedScriptCardProps) {
	const [localScripts, setLocalScripts] = useState(scripts)
	const [localNames, setLocalNames] = useState<Record<string, string>>(() =>
		Object.fromEntries(
			scripts.map((s) => [s.id, s.confirmed_name ?? s.proposed_name ?? ""]),
		),
	)
	const [urls, setUrls] = useState<Record<string, string>>({})
	const [activeDrag, setActiveDrag] = useState<ActiveDragState | null>(null)
	const [carousel, setCarousel] = useState<CarouselState | null>(null)
	const isDraggingRef = useRef(false)

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
	)

	// Sync local scripts from updated props (e.g. after parent refetch), skip mid-drag
	useEffect(() => {
		if (!isDraggingRef.current) {
			setLocalScripts(scripts)
		}
	}, [scripts])

	// Load presigned GET URLs for all pages in the batch once
	useEffect(() => {
		getStagedScriptPageUrls(batchId).then((r) => {
			if (r.ok) setUrls(r.urls)
		})
	}, [batchId])

	function openCarousel(
		script: BatchMarkingJobData["staged_scripts"][number],
		startIndex: number,
	) {
		const pageKeys = (script.page_keys as PageKeyRaw[])
			.slice()
			.sort((a, b) => a.order - b.order)
		const pages: PageItem[] = pageKeys.map((pk) => ({
			key: pk.s3_key,
			url: urls[pk.s3_key] ?? "",
			order: pk.order,
			mimeType: pk.mime_type,
			sourceFile: pk.source_file,
		}))
		const name = localNames[script.id] ?? script.proposed_name ?? ""
		setCarousel({ pages, index: startIndex, scriptName: name })
	}

	// ── DnD handlers ──────────────────────────────────────────────────────────

	function handleDragStart(event: DragStartEvent) {
		isDraggingRef.current = true
		const key = event.active.id as string
		setActiveDrag({ key, url: urls[key] ?? "" })
	}

	function handleDragEnd(event: DragEndEvent) {
		isDraggingRef.current = false
		const { over, active } = event
		setActiveDrag(null)
		if (!over || over.id === active.id) return

		const dragKey = active.id as string
		const overId = over.id as string

		const sourceScript = localScripts.find((s) =>
			(s.page_keys as PageKeyRaw[]).some((pk) => pk.s3_key === dragKey),
		)
		if (!sourceScript) return

		const overIsPage = localScripts.some((s) =>
			(s.page_keys as PageKeyRaw[]).some((pk) => pk.s3_key === overId),
		)
		const targetScript = overIsPage
			? localScripts.find((s) =>
					(s.page_keys as PageKeyRaw[]).some((pk) => pk.s3_key === overId),
				)!
			: (localScripts.find((s) => s.id === overId) ?? null)

		if (!targetScript) return

		// ── Same script: reorder ───────────────────────────────────────────────
		if (sourceScript.id === targetScript.id) {
			const pages = sourceScript.page_keys as PageKeyRaw[]
			const oldIdx = pages.findIndex((pk) => pk.s3_key === dragKey)
			const newIdx = pages.findIndex((pk) => pk.s3_key === overId)
			if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return
			const reordered = arrayMove(pages, oldIdx, newIdx).map((pk, i) => ({
				...pk,
				order: i + 1,
			}))
			const updated = { ...sourceScript, page_keys: reordered }
			setLocalScripts((prev) =>
				prev.map((s) => (s.id === sourceScript.id ? updated : s)),
			)
			void persistPageKeys(updated)
			return
		}

		// ── Cross-script: remove from source, insert into target ──────────────
		const draggedPage = (sourceScript.page_keys as PageKeyRaw[]).find(
			(pk) => pk.s3_key === dragKey,
		)!
		const newSourcePages = (sourceScript.page_keys as PageKeyRaw[])
			.filter((pk) => pk.s3_key !== dragKey)
			.map((pk, i) => ({ ...pk, order: i + 1 }))

		const targetPages = [...(targetScript.page_keys as PageKeyRaw[])]
		if (overIsPage) {
			const insertAt = targetPages.findIndex((pk) => pk.s3_key === overId)
			targetPages.splice(
				insertAt === -1 ? targetPages.length : insertAt,
				0,
				draggedPage,
			)
		} else {
			targetPages.push(draggedPage)
		}
		const newTargetPages = targetPages.map((pk, i) => ({
			...pk,
			order: i + 1,
		}))

		const updatedSource = { ...sourceScript, page_keys: newSourcePages }
		const updatedTarget = { ...targetScript, page_keys: newTargetPages }

		setLocalScripts((prev) =>
			prev.map((s) => {
				if (s.id === sourceScript.id) return updatedSource
				if (s.id === targetScript.id) return updatedTarget
				return s
			}),
		)
		void persistPageKeys(updatedSource)
		void persistPageKeys(updatedTarget)
	}

	async function persistPageKeys(
		script: BatchMarkingJobData["staged_scripts"][number],
	) {
		const r = await updateStagedScriptPageKeys(
			script.id,
			script.page_keys as PageKeyRaw[],
		)
		if (!r.ok) toast.error(r.error)
	}

	async function handleDelete(scriptId: string) {
		const r = await deleteStagedScript(scriptId)
		if (!r.ok) {
			toast.error(r.error)
			return
		}
		setLocalScripts((prev) => prev.filter((s) => s.id !== scriptId))
		setLocalNames((prev) => {
			const next = { ...prev }
			delete next[scriptId]
			return next
		})
		onDeleteScript?.(scriptId)
	}

	return (
		<>
			<DndContext
				sensors={sensors}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEnd}
			>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{localScripts.map((script) => (
						<DndScriptCard
							key={script.id}
							script={script}
							localNames={localNames}
							urls={urls}
							activeDragKey={activeDrag?.key ?? null}
							onOpenCarousel={openCarousel}
							onUpdateLocalName={(id, value) =>
								setLocalNames((prev) => ({ ...prev, [id]: value }))
							}
							onUpdateName={onUpdateName}
							onToggleExclude={onToggleExclude}
							onDelete={handleDelete}
						/>
					))}
				</div>

				<DragOverlay dropAnimation={null}>
					{activeDrag?.url ? (
						<div className="w-14 h-20 rounded border-2 border-primary shadow-xl overflow-hidden rotate-1 opacity-90">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={activeDrag.url}
								alt="Dragging"
								className="w-full h-full object-cover"
								draggable={false}
							/>
						</div>
					) : null}
				</DragOverlay>
			</DndContext>

			{/* Page carousel */}
			{carousel && (
				<PageCarousel
					pages={carousel.pages}
					index={carousel.index}
					scriptName={carousel.scriptName}
					onClose={() => setCarousel(null)}
					onNavigate={(i) =>
						setCarousel((prev) => (prev ? { ...prev, index: i } : prev))
					}
				/>
			)}
		</>
	)
}

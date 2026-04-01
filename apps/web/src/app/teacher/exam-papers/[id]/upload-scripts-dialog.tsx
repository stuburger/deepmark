"use client"

import { Button } from "@/components/ui/button"
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
	createBatchIngestJob,
	getBatchIngestJob,
	splitStagedScript,
	triggerClassification,
	updateBatchJobSettings,
	updateStagedScript,
} from "@/lib/batch/mutations"
import type { BatchIngestJobData } from "@/lib/batch/mutations"
import {
	AlertTriangle,
	CheckCircle2,
	ChevronDown,
	FileText,
	Loader2,
	Scissors,
	Trash2,
	Upload,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { StagedScriptReviewCards } from "./staged-script-review-cards"

type Phase = "upload" | "classifying" | "staging" | "marking" | "done"

type FileItem = {
	name: string
	mimeType: string
	uploading: boolean
	error: string | null
}

export function UploadScriptsDialog({
	examPaperId,
	open,
	onOpenChange,
	onBatchStarted,
}: {
	examPaperId: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onBatchStarted?: () => void
}) {
	const [phase, setPhase] = useState<Phase>("upload")
	const [files, setFiles] = useState<FileItem[]>([])
	const [batchJobId, setBatchJobId] = useState<string | null>(null)
	const [batchData, setBatchData] = useState<BatchIngestJobData | null>(null)
	const [committing, setCommitting] = useState(false)
	const [showAdvanced, setShowAdvanced] = useState(false)
	const [autoCommit, setAutoCommit] = useState(false)
	const [blankPageMode, setBlankPageMode] = useState<
		"script_page" | "separator"
	>("script_page")
	const [pagesPerScript, setPagesPerScript] = useState(4)
	const [classificationMode, setClassificationMode] = useState<
		"auto" | "per_file"
	>("auto")
	const fileInputRef = useRef<HTMLInputElement>(null)
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
			setClassificationMode("auto")
		}
		onOpenChange(next)
	}

	// ── Polling ───────────────────────────────────────────────────────────────

	function startPolling(jobId: string) {
		stopPolling()
		pollRef.current = setInterval(async () => {
			const result = await getBatchIngestJob(jobId)
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
		const result = await createBatchIngestJob(
			examPaperId,
			autoCommit ? "auto" : "required",
			blankPageMode,
			pagesPerScript,
			classificationMode,
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
		onBatchStarted?.()
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
			const result = await getBatchIngestJob(batchJobId)
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
		const result = await getBatchIngestJob(batchJobId)
		if (result.ok) setBatchData(result.batch)
	}

	async function handleSplitScript(scriptId: string, splitAfterIndex: number) {
		const result = await splitStagedScript(scriptId, splitAfterIndex)
		if (!result.ok) {
			toast.error(result.error)
			return
		}
		if (batchJobId) {
			const refreshed = await getBatchIngestJob(batchJobId)
			if (refreshed.ok) setBatchData(refreshed.batch)
		}
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
	const oversizedCount =
		batchData && batchData.classification_mode === "per_file"
			? batchData.staged_scripts.filter(
					(s) =>
						s.status === "proposed" &&
						(s.page_keys as { s3_key: string }[]).length >
							batchData.pages_per_script * 2,
				).length
			: 0
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
							<DialogTitle>Upload student scripts</DialogTitle>
							<DialogDescription>
								Upload PDFs or images. Each file can be a single student&apos;s
								script or contain multiple students&apos; scripts in one PDF.
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
									{/* Classification mode */}
									<div className="flex items-center justify-between gap-4">
										<div className="space-y-0.5">
											<p className="text-sm font-medium">
												Each file is one student&apos;s script
											</p>
											<p className="text-xs text-muted-foreground">
												Skip AI segmentation. Faster and cheaper, but
												you&apos;ll need to manually split any file containing
												multiple students.
											</p>
										</div>
										<button
											type="button"
											role="switch"
											aria-checked={classificationMode === "per_file"}
											disabled={phase !== "upload"}
											onClick={() => {
												const next =
													classificationMode === "per_file"
														? "auto"
														: "per_file"
												setClassificationMode(next)
												if (batchJobId) {
													void updateBatchJobSettings(batchJobId, {
														classificationMode: next,
													})
												}
											}}
											className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
												classificationMode === "per_file"
													? "bg-primary"
													: "bg-input"
											}`}
										>
											<span
												className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
													classificationMode === "per_file"
														? "translate-x-4"
														: "translate-x-0"
												}`}
											/>
										</button>
									</div>

									{/* Auto-start marking */}
									<div className="flex items-center justify-between gap-4">
										<div className="space-y-0.5">
											<p className="text-sm font-medium">Auto-start marking</p>
											<p className="text-xs text-muted-foreground">
												Skip review if all scripts are detected with high
												confidence. When off, always review before marking.
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

									{/* Pages per script — hidden in per_file mode since it doesn't apply */}
									{classificationMode === "auto" && (
										<>
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
														When on, blank pages split between students. When
														off, blank pages are classified by context.
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
										</>
									)}
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
								{classificationMode === "per_file"
									? "Preparing your scripts for review."
									: "Gemini is reading and grouping the scripts by student. This usually takes under a minute."}
							</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col items-center gap-4 py-8">
							<Loader2 className="h-10 w-10 animate-spin text-primary" />
							<p className="text-sm text-muted-foreground">
								{classificationMode === "per_file"
									? "Processing pages…"
									: "Analysing your upload…"}
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

						{oversizedCount > 0 && (
							<div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
								<AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
								<div>
									<p className="font-medium">
										{oversizedCount} script
										{oversizedCount === 1 ? "" : "s"} may contain multiple
										students
									</p>
									<p className="text-xs mt-0.5 opacity-80">
										These files have more pages than expected for a single
										student. Use the split action on each card to separate them,
										or drag pages between scripts.
									</p>
								</div>
							</div>
						)}

						{proposedCount > 0 && oversizedCount === 0 && (
							<div className="flex justify-end">
								<Button variant="outline" size="sm" onClick={handleConfirmAll}>
									Confirm all
								</Button>
							</div>
						)}

						{proposedCount > 0 && oversizedCount > 0 && (
							<div className="flex justify-end">
								<Button
									variant="outline"
									size="sm"
									onClick={handleConfirmAll}
									title="Confirm scripts that are not oversized"
								>
									Confirm non-oversized
								</Button>
							</div>
						)}

						<StagedScriptReviewCards
							batchId={batchJobId ?? ""}
							scripts={batchData.staged_scripts}
							pagesPerScript={batchData.pages_per_script}
							classificationMode={batchData.classification_mode}
							onUpdateName={handleUpdateName}
							onToggleExclude={handleToggleExclude}
							onSplitScript={handleSplitScript}
							onDeleteScript={async () => {
								if (batchJobId) {
									const result = await getBatchIngestJob(batchJobId)
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

// ─── Oversized script split helper ────────────────────────────────────────────

export function OversizedScriptBanner({
	scriptId,
	pageCount,
	pagesPerScript,
	onSplit,
}: {
	scriptId: string
	pageCount: number
	pagesPerScript: number
	onSplit: (scriptId: string, splitAfterIndex: number) => void
}) {
	const midpoint = Math.floor(pageCount / 2) - 1
	return (
		<div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
			<AlertTriangle className="h-3.5 w-3.5 shrink-0" />
			<span>
				{pageCount} pages — expected ~{pagesPerScript}
			</span>
			<button
				type="button"
				onClick={() => onSplit(scriptId, midpoint)}
				className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium hover:bg-amber-500/20 transition-colors"
			>
				<Scissors className="h-3 w-3" />
				Split at midpoint
			</button>
		</div>
	)
}

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
	AlertTriangle,
	CheckCircle2,
	ChevronDown,
	FileText,
	Loader2,
	Trash2,
	Upload,
} from "lucide-react"
import Link from "next/link"
import { useBatchUpload } from "./hooks/use-batch-upload"
import { StagedScriptReviewCards } from "./staged-script-review-cards"

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
	const batch = useBatchUpload({ examPaperId, onOpenChange, onBatchStarted })

	return (
		<Dialog open={open} onOpenChange={batch.handleOpenChange}>
			<DialogContent
				className={
					batch.phase === "staging"
						? "sm:max-w-4xl max-h-[90vh] overflow-y-auto"
						: "max-w-lg"
				}
			>
				{/* ── Phase 1: Upload ── */}
				{batch.phase === "upload" && (
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
								onClick={() => batch.fileInputRef.current?.click()}
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

							{batch.files.length > 0 && (
								<div className="space-y-1.5 max-h-52 overflow-y-auto">
									{batch.files.map((file) => (
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
														batch.setFiles((prev) =>
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
								onClick={() => batch.setShowAdvanced((v) => !v)}
								className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
							>
								<ChevronDown
									className={`h-3.5 w-3.5 transition-transform ${
										batch.showAdvanced ? "rotate-180" : ""
									}`}
								/>
								Advanced
							</button>
							{batch.showAdvanced && (
								<div className="mt-3 space-y-4 rounded-lg border bg-muted/20 p-4">
									{/* Classification mode */}
									<ToggleSetting
										label="Each file is one student's script"
										description="Skip AI segmentation. Faster and cheaper, but you'll need to manually split any file containing multiple students."
										checked={batch.classificationMode === "per_file"}
										disabled={batch.phase !== "upload"}
										onToggle={() => {
											const next =
												batch.classificationMode === "per_file"
													? "auto"
													: "per_file"
											batch.setClassificationMode(next)
											batch.handleUpdateSettings({
												classificationMode: next,
											})
										}}
									/>

									{/* Auto-start marking */}
									<ToggleSetting
										label="Auto-start marking"
										description="Skip review if all scripts are detected with high confidence. When off, always review before marking."
										checked={batch.autoCommit}
										disabled={batch.phase !== "upload"}
										onToggle={() => {
											const next = !batch.autoCommit
											batch.setAutoCommit(next)
											batch.handleUpdateSettings({
												reviewMode: next ? "auto" : "required",
											})
										}}
									/>

									{/* Pages per script — hidden in per_file mode */}
									{batch.classificationMode === "auto" && (
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
													value={batch.pagesPerScript}
													onChange={(e) => {
														const next = Math.min(
															20,
															Math.max(1, Number(e.target.value)),
														)
														batch.setPagesPerScript(next)
														batch.handleUpdateSettings({
															pagesPerScript: next,
														})
													}}
													className="h-8 w-24 text-sm"
													disabled={batch.phase !== "upload"}
												/>
											</div>

											<ToggleSetting
												label="Treat blank pages as script separators"
												description="When on, blank pages split between students. When off, blank pages are classified by context."
												checked={batch.blankPageMode === "separator"}
												disabled={batch.phase !== "upload"}
												onToggle={() => {
													const next =
														batch.blankPageMode === "separator"
															? "script_page"
															: "separator"
													batch.setBlankPageMode(next)
													batch.handleUpdateSettings({
														blankPageMode: next,
													})
												}}
											/>
										</>
									)}
								</div>
							)}
						</div>

						<DialogFooter>
							{batch.files.length > 0 && !batch.isUploading && (
								<Button
									variant="outline"
									size="sm"
									onClick={() => batch.fileInputRef.current?.click()}
								>
									+ Add more
								</Button>
							)}
							<Button
								disabled={!batch.canStart}
								onClick={batch.handleStartClassifying}
							>
								{batch.isUploading ? (
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
				{batch.phase === "classifying" && (
					<>
						<DialogHeader>
							<DialogTitle>Analysing your upload</DialogTitle>
							<DialogDescription>
								{batch.classificationMode === "per_file"
									? "Preparing your scripts for review."
									: "Gemini is reading and grouping the scripts by student. This usually takes under a minute."}
							</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col items-center gap-4 py-8">
							<Loader2 className="h-10 w-10 animate-spin text-primary" />
							<p className="text-sm text-muted-foreground">
								{batch.classificationMode === "per_file"
									? "Processing pages…"
									: "Analysing your upload…"}
							</p>
						</div>
						<DialogFooter>
							<Button
								variant="ghost"
								onClick={() => batch.handleOpenChange(false)}
							>
								Cancel
							</Button>
						</DialogFooter>
					</>
				)}

				{/* ── Phase 3: Staging ── */}
				{batch.phase === "staging" && batch.batchData && (
					<>
						<DialogHeader>
							<DialogTitle>Review detected scripts</DialogTitle>
							<DialogDescription>
								{batch.batchData.staged_scripts.length} script
								{batch.batchData.staged_scripts.length === 1 ? "" : "s"}{" "}
								detected. Confirm names before marking.
								{batch.proposedCount > 0 && (
									<span className="ml-1 text-amber-600 font-medium">
										{batch.proposedCount} still need review.
									</span>
								)}
							</DialogDescription>
						</DialogHeader>

						{batch.oversizedCount > 0 && (
							<div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
								<AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
								<div>
									<p className="font-medium">
										{batch.oversizedCount} script
										{batch.oversizedCount === 1 ? "" : "s"} may contain multiple
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

						{batch.proposedCount > 0 && batch.oversizedCount === 0 && (
							<div className="flex justify-end">
								<Button
									variant="outline"
									size="sm"
									onClick={batch.handleConfirmAll}
								>
									Confirm all
								</Button>
							</div>
						)}

						{batch.proposedCount > 0 && batch.oversizedCount > 0 && (
							<div className="flex justify-end">
								<Button
									variant="outline"
									size="sm"
									onClick={batch.handleConfirmAll}
									title="Confirm scripts that are not oversized"
								>
									Confirm non-oversized
								</Button>
							</div>
						)}

						<StagedScriptReviewCards
							batchId={batch.batchJobId ?? ""}
							scripts={batch.batchData.staged_scripts}
							pagesPerScript={batch.batchData.pages_per_script}
							classificationMode={batch.batchData.classification_mode}
							onUpdateName={batch.handleUpdateName}
							onToggleExclude={batch.handleToggleExclude}
							onSplitScript={batch.handleSplitScript}
							onDeleteScript={batch.handleRefreshBatch}
						/>

						{batch.confirmedCount > 0 && (
							<DialogFooter>
								<Button
									disabled={batch.committing || batch.proposedCount > 0}
									onClick={batch.handleCommit}
								>
									{batch.committing ? (
										<>
											<Spinner className="h-4 w-4 mr-2" />
											Starting…
										</>
									) : (
										`Start marking ${batch.confirmedCount} script${
											batch.confirmedCount === 1 ? "" : "s"
										}`
									)}
								</Button>
							</DialogFooter>
						)}
					</>
				)}

				{/* ── Phase 4: Marking ── */}
				{batch.phase === "marking" && (
					<>
						<DialogHeader>
							<DialogTitle>Marking in progress</DialogTitle>
							<DialogDescription>
								Scripts are being OCR&apos;d and graded in the background. You
								can close this dialog — the Submissions tab will show progress.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-4 py-2">
							{batch.totalJobs > 0 && (
								<div className="space-y-2">
									<div className="flex justify-between text-sm">
										<span className="text-muted-foreground">
											{batch.completeJobs} of {batch.totalJobs} complete
										</span>
										<span className="text-muted-foreground">
											{Math.round(
												(batch.completeJobs / batch.totalJobs) * 100,
											)}
											%
										</span>
									</div>
									<Progress
										value={(batch.completeJobs / batch.totalJobs) * 100}
									/>
								</div>
							)}
							<p className="text-sm text-muted-foreground">
								You&apos;ll get a browser notification when all scripts are done.
							</p>
							<Link
								href={`/teacher/mark/papers/${examPaperId}`}
								className="text-sm text-primary underline underline-offset-4"
							>
								View results →
							</Link>
						</div>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => batch.handleOpenChange(false)}
							>
								Close
							</Button>
						</DialogFooter>
					</>
				)}

				{/* ── Phase 5: Done ── */}
				{batch.phase === "done" && batch.batchData && (
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
								{batch.totalJobs} script{batch.totalJobs === 1 ? "" : "s"}{" "}
								marked
							</p>
						</div>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => batch.handleOpenChange(false)}
							>
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
					ref={batch.fileInputRef}
					type="file"
					accept="image/*,application/pdf"
					multiple
					className="sr-only"
					onChange={(e) => {
						batch.handleFiles(e.target.files)
						e.target.value = ""
					}}
				/>
			</DialogContent>
		</Dialog>
	)
}

// ── Reusable toggle switch for advanced settings ────────────────────────────

function ToggleSetting({
	label,
	description,
	checked,
	disabled,
	onToggle,
}: {
	label: string
	description: string
	checked: boolean
	disabled: boolean
	onToggle: () => void
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="space-y-0.5">
				<p className="text-sm font-medium">{label}</p>
				<p className="text-xs text-muted-foreground">{description}</p>
			</div>
			<button
				type="button"
				role="switch"
				aria-checked={checked}
				disabled={disabled}
				onClick={onToggle}
				className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
					checked ? "bg-primary" : "bg-input"
				}`}
			>
				<span
					className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
						checked ? "translate-x-4" : "translate-x-0"
					}`}
				/>
			</button>
		</div>
	)
}

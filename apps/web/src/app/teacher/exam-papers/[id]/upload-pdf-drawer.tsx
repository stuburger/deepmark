"use client"

import { PdfIngestionProgressView } from "@/components/pdf-ingestion-progress"
import type { PdfIngestionDocumentType } from "@/components/pdf-ingestion-progress"
import { Button } from "@/components/ui/button"
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import {
	archiveExistingDocument,
	cancelPdfIngestionJob,
	checkExistingDocument,
	createLinkedPdfUpload,
	getPdfIngestionJobStatus,
	retriggerPdfIngestionJob,
} from "@/lib/pdf-ingestion-actions"
import {
	AlertCircle,
	AlertTriangle,
	CheckCircle2,
	RefreshCw,
	Upload,
	XCircle,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

type DocumentType = "mark_scheme" | "exemplar" | "question_paper"

type TrackingJob = {
	id: string
	document_type: string
	status: string
	error: string | null
}

const TERMINAL = new Set(["ocr_complete", "failed", "cancelled"])

const DOCUMENT_TYPES: {
	value: DocumentType
	label: string
	description: string
}[] = [
	{
		value: "mark_scheme",
		label: "Mark scheme",
		description: "Populates questions and mark scheme criteria",
	},
	{
		value: "question_paper",
		label: "Question paper",
		description: "Populates questions without mark scheme",
	},
	{
		value: "exemplar",
		label: "Exemplar memo",
		description: "Adds exemplar student answers",
	},
]

function docTypeToIngestionType(type: string): PdfIngestionDocumentType {
	switch (type) {
		case "mark_scheme":
			return "mark_scheme"
		case "question_paper":
			return "question_paper"
		case "student_paper":
			return "student_paper"
		default:
			return "exemplar"
	}
}

type ExistingInfo = { questionCount: number; exemplarCount: number }

function ReplaceConfirmView({
	documentType,
	existingInfo,
	onConfirm,
	onCancel,
	archiving,
}: {
	documentType: DocumentType
	existingInfo: ExistingInfo
	onConfirm: () => void
	onCancel: () => void
	archiving: boolean
}) {
	const docLabel =
		documentType === "mark_scheme"
			? "mark scheme"
			: documentType === "question_paper"
				? "question paper"
				: "exemplar"

	const count =
		documentType === "exemplar"
			? existingInfo.exemplarCount
			: existingInfo.questionCount

	const countLabel =
		documentType === "exemplar"
			? `${count} exemplar answer${count !== 1 ? "s" : ""}`
			: `${count} question${count !== 1 ? "s" : ""}`

	return (
		<div className="space-y-4 py-2">
			<div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
				<AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
				<div className="min-w-0">
					<p className="text-sm font-medium text-amber-900 dark:text-amber-100">
						Replace existing {docLabel}?
					</p>
					<p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
						This paper already has {countLabel} from a {docLabel} upload. They
						will be removed from the paper and replaced with the new PDF.
					</p>
				</div>
			</div>

			<div className="space-y-2">
				<Button
					className="w-full"
					variant="destructive"
					onClick={onConfirm}
					disabled={archiving}
				>
					{archiving ? (
						<>
							<Spinner className="h-4 w-4 mr-2" />
							Removing existing…
						</>
					) : (
						<>Replace {docLabel}</>
					)}
				</Button>
				<Button
					className="w-full"
					variant="outline"
					onClick={onCancel}
					disabled={archiving}
				>
					Keep existing
				</Button>
			</div>
		</div>
	)
}

// ─── Upload state hook ────────────────────────────────────────────────────────

function useUploadState(examPaperId: string, onComplete: () => void) {
	const [documentType, setDocumentType] = useState<DocumentType>("mark_scheme")
	const [runAdversarialLoop, setRunAdversarialLoop] = useState(false)
	const [checking, setChecking] = useState(false)
	const [pendingFile, setPendingFile] = useState<File | null>(null)
	const [existingInfo, setExistingInfo] = useState<ExistingInfo | null>(null)
	const [archiving, setArchiving] = useState(false)
	const [uploading, setUploading] = useState(false)
	const [jobId, setJobId] = useState<string | null>(null)
	const [jobStatus, setJobStatus] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	const isConfirming = pendingFile !== null && existingInfo !== null

	const pollStatus = useCallback(
		async (id: string) => {
			const result = await getPdfIngestionJobStatus(id)
			if (!result.ok) return
			setJobStatus(result.status)
			if (result.status === "ocr_complete") onComplete()
			if (result.status === "failed") {
				setError(result.error ?? "Processing failed. Please try again.")
			}
		},
		[onComplete],
	)

	useEffect(() => {
		if (!jobId || TERMINAL.has(jobStatus ?? "")) return
		const interval = setInterval(() => pollStatus(jobId), 3000)
		return () => clearInterval(interval)
	}, [jobId, jobStatus, pollStatus])

	async function doUpload(file: File) {
		setError(null)
		setUploading(true)
		try {
			const result = await createLinkedPdfUpload({
				exam_paper_id: examPaperId,
				document_type: documentType,
				run_adversarial_loop:
					documentType === "mark_scheme" ? runAdversarialLoop : false,
			})
			if (!result.ok) {
				setError(result.error)
				return
			}
			const putRes = await fetch(result.url, {
				method: "PUT",
				body: file,
				headers: { "Content-Type": "application/pdf" },
			})
			if (!putRes.ok) {
				setError("Upload to storage failed. Please try again.")
				return
			}
			setJobId(result.jobId)
		} catch {
			setError("Upload failed. Please try again.")
		} finally {
			setUploading(false)
		}
	}

	async function handleFile(file: File) {
		if (!file.type.includes("pdf")) {
			setError("Please select a PDF file.")
			return
		}
		setError(null)
		setChecking(true)
		try {
			const check = await checkExistingDocument(examPaperId, documentType)
			if (!check.ok) {
				setError(check.error)
				return
			}
			if (check.exists) {
				setPendingFile(file)
				setExistingInfo({
					questionCount: check.questionCount,
					exemplarCount: check.exemplarCount,
				})
				return
			}
			await doUpload(file)
		} finally {
			setChecking(false)
		}
	}

	async function handleConfirmReplace() {
		if (!pendingFile) return
		setArchiving(true)
		setError(null)
		try {
			const result = await archiveExistingDocument(examPaperId, documentType)
			if (!result.ok) {
				setError(result.error)
				setPendingFile(null)
				setExistingInfo(null)
				return
			}
			const file = pendingFile
			setPendingFile(null)
			setExistingInfo(null)
			await doUpload(file)
		} finally {
			setArchiving(false)
		}
	}

	function handleCancelReplace() {
		setPendingFile(null)
		setExistingInfo(null)
	}

	function reset() {
		setDocumentType("mark_scheme")
		setRunAdversarialLoop(false)
		setChecking(false)
		setPendingFile(null)
		setExistingInfo(null)
		setArchiving(false)
		setUploading(false)
		setJobId(null)
		setJobStatus(null)
		setError(null)
	}

	const isProcessing =
		!!jobId && jobStatus !== "failed" && jobStatus !== "cancelled"

	const showSelector =
		!isConfirming && !isProcessing && !uploading && !checking && !archiving

	return {
		documentType,
		setDocumentType,
		runAdversarialLoop,
		setRunAdversarialLoop,
		checking,
		uploading,
		jobStatus,
		error,
		setError,
		isProcessing,
		isConfirming,
		existingInfo,
		archiving,
		showSelector,
		handleFile,
		handleConfirmReplace,
		handleCancelReplace,
		reset,
	}
}

// ─── Tracking view ────────────────────────────────────────────────────────────

function TrackingView({
	job,
	onClose,
	onJobUpdated,
}: {
	job: TrackingJob
	onClose: () => void
	onJobUpdated: (updated: Partial<TrackingJob>) => void
}) {
	const isFailed = job.status === "failed"
	const isCancelled = job.status === "cancelled"
	const isComplete = job.status === "ocr_complete"
	const isActive = !TERMINAL.has(job.status)
	const [retrying, setRetrying] = useState(false)
	const [cancelling, setCancelling] = useState(false)

	async function handleCancel() {
		setCancelling(true)
		await cancelPdfIngestionJob(job.id)
		onJobUpdated({ status: "cancelled" })
		setCancelling(false)
	}

	async function handleRetry() {
		setRetrying(true)
		await retriggerPdfIngestionJob(job.id)
		onJobUpdated({ status: "pending", error: null })
		setRetrying(false)
	}

	return (
		<div className="space-y-4">
			{isActive && (
				<PdfIngestionProgressView
					status={job.status}
					documentType={docTypeToIngestionType(job.document_type)}
				/>
			)}

			{isComplete && (
				<div className="flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/5 px-3 py-3">
					<CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
					<div>
						<p className="text-sm font-medium">Processing complete</p>
						<p className="text-xs text-muted-foreground">
							Questions and mark scheme criteria have been added.
						</p>
					</div>
				</div>
			)}

			{isFailed && (
				<div className="space-y-3">
					<div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-3">
						<AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-destructive" />
						<div>
							<p className="text-sm font-medium text-destructive">
								Processing failed
							</p>
							{job.error && (
								<p className="mt-0.5 text-xs text-destructive/80">
									{job.error}
								</p>
							)}
						</div>
					</div>
				</div>
			)}

			{isCancelled && (
				<div className="flex items-center gap-3 rounded-xl border px-3 py-3 text-muted-foreground">
					<XCircle className="h-5 w-5 shrink-0" />
					<p className="text-sm">This job was cancelled.</p>
				</div>
			)}

			{isCancelled && (
				<div className="flex gap-2">
					<Button
						size="sm"
						variant="outline"
						className="flex-1"
						disabled={retrying}
						onClick={handleRetry}
					>
						{retrying ? (
							<Spinner className="h-3.5 w-3.5 mr-1.5" />
						) : (
							<RefreshCw className="h-3.5 w-3.5 mr-1.5" />
						)}
						Retry
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="flex-1 text-muted-foreground"
						onClick={onClose}
					>
						Dismiss
					</Button>
				</div>
			)}

			{isActive && (
				<div className="flex justify-end">
					<Button
						size="sm"
						variant="outline"
						className="text-destructive hover:text-destructive"
						disabled={cancelling}
						onClick={handleCancel}
					>
						{cancelling ? (
							<Spinner className="h-3.5 w-3.5 mr-1.5" />
						) : (
							<XCircle className="h-3.5 w-3.5 mr-1.5" />
						)}
						Cancel job
					</Button>
				</div>
			)}

			{isFailed && (
				<div className="flex gap-2">
					<Button
						size="sm"
						variant="outline"
						className="flex-1"
						disabled={retrying}
						onClick={handleRetry}
					>
						{retrying ? (
							<Spinner className="h-3.5 w-3.5 mr-1.5" />
						) : (
							<RefreshCw className="h-3.5 w-3.5 mr-1.5" />
						)}
						Try again
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="flex-1 text-muted-foreground"
						onClick={onClose}
					>
						Dismiss
					</Button>
				</div>
			)}

			{isComplete && (
				<Button variant="outline" className="w-full" onClick={onClose}>
					Close
				</Button>
			)}
		</div>
	)
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

export function UploadPdfDrawer({
	examPaperId,
	open,
	onOpenChange,
	trackingJob: trackingJobProp,
	onUploadComplete,
}: {
	examPaperId: string
	open: boolean
	onOpenChange: (open: boolean) => void
	/** When set, the drawer opens in tracking mode for this job instead of upload mode. */
	trackingJob: TrackingJob | null
	onUploadComplete: () => void
}) {
	// Local mutable copy of the tracking job (so retry/cancel can optimistically update)
	const [localTrackingJob, setLocalTrackingJob] = useState<TrackingJob | null>(
		trackingJobProp,
	)
	const fileInputRef = useRef<HTMLInputElement>(null)

	// Keep local copy in sync with parent prop updates (polling)
	useEffect(() => {
		setLocalTrackingJob(trackingJobProp)
	}, [trackingJobProp])

	const isTrackingMode = localTrackingJob !== null

	const {
		documentType,
		setDocumentType,
		runAdversarialLoop,
		setRunAdversarialLoop,
		checking,
		uploading,
		jobStatus,
		error,
		setError,
		isProcessing,
		isConfirming,
		existingInfo,
		archiving,
		showSelector,
		handleFile,
		handleConfirmReplace,
		handleCancelReplace,
		reset,
	} = useUploadState(examPaperId, onUploadComplete)

	function handleOpenChange(next: boolean) {
		if (!next && !isTrackingMode && (isProcessing || uploading || archiving))
			return
		onOpenChange(next)
		if (!next) reset()
	}

	const drawerTitle = isTrackingMode
		? "Processing progress"
		: isProcessing
			? "Uploading…"
			: "Upload PDF"
	const drawerDescription = isTrackingMode
		? undefined
		: isProcessing
			? undefined
			: "Add a mark scheme, question paper, or exemplar to this exam paper."

	const controlsDisabled = uploading || checking || archiving

	return (
		<Drawer open={open} onOpenChange={handleOpenChange}>
			<DrawerContent className="max-h-[92dvh]">
				<DrawerHeader className="pb-2">
					<DrawerTitle>{drawerTitle}</DrawerTitle>
					{drawerDescription && (
						<DrawerDescription>{drawerDescription}</DrawerDescription>
					)}
				</DrawerHeader>

				<div className="flex-1 overflow-y-auto px-4 pb-2 space-y-4">
					{/* ── Tracking mode ── */}
					{isTrackingMode && localTrackingJob && (
						<TrackingView
							job={localTrackingJob}
							onClose={() => onOpenChange(false)}
							onJobUpdated={(updated) =>
								setLocalTrackingJob((prev) =>
									prev ? { ...prev, ...updated } : prev,
								)
							}
						/>
					)}

					{/* ── Upload mode ── */}
					{!isTrackingMode && checking && (
						<div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
							<Spinner className="h-4 w-4" />
							<span>Checking for existing uploads…</span>
						</div>
					)}

					{!isTrackingMode && isConfirming && existingInfo && (
						<ReplaceConfirmView
							documentType={documentType}
							existingInfo={existingInfo}
							onConfirm={handleConfirmReplace}
							onCancel={handleCancelReplace}
							archiving={archiving}
						/>
					)}

					{!isTrackingMode && showSelector && (
						<>
							<div className="space-y-2">
								<p className="text-sm font-medium">Document type</p>
								<div className="space-y-2">
									{DOCUMENT_TYPES.map((dt) => (
										<label
											key={dt.value}
											className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors active:bg-muted/50 ${
												documentType === dt.value
													? "border-primary bg-primary/5"
													: "border-border"
											}`}
										>
											<input
												type="radio"
												name="document_type"
												value={dt.value}
												checked={documentType === dt.value}
												onChange={() => setDocumentType(dt.value)}
												className="mt-0.5 accent-primary"
												disabled={controlsDisabled}
											/>
											<div className="min-w-0">
												<p className="text-sm font-medium">{dt.label}</p>
												<p className="text-xs text-muted-foreground">
													{dt.description}
												</p>
											</div>
										</label>
									))}
								</div>
							</div>

							{documentType === "mark_scheme" && (
								<div className="flex items-center justify-between rounded-xl border p-3.5 gap-3">
									<div className="min-w-0">
										<p className="text-sm font-medium">
											Run adversarial quality check
										</p>
										<p className="text-xs text-muted-foreground">
											Generates synthetic answers to test mark scheme accuracy.
											Adds 5–20 minutes.
										</p>
									</div>
									<Switch
										checked={runAdversarialLoop}
										onCheckedChange={setRunAdversarialLoop}
										disabled={controlsDisabled}
										className="shrink-0"
									/>
								</div>
							)}

							<button
								type="button"
								disabled={controlsDisabled}
								onClick={() => fileInputRef.current?.click()}
								className="w-full flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-input bg-muted/20 py-10 gap-3 transition-colors active:bg-muted/40 disabled:opacity-50 disabled:pointer-events-none"
							>
								{uploading ? (
									<>
										<Spinner className="h-7 w-7 text-muted-foreground" />
										<p className="text-sm font-medium text-muted-foreground">
											Uploading…
										</p>
									</>
								) : (
									<>
										<Upload className="h-7 w-7 text-muted-foreground" />
										<div className="text-center">
											<p className="text-sm font-medium">Tap to select a PDF</p>
											<p className="text-xs text-muted-foreground mt-0.5">
												PDF files only
											</p>
										</div>
									</>
								)}
							</button>
							<input
								ref={fileInputRef}
								type="file"
								accept=".pdf,application/pdf"
								className="sr-only"
								disabled={controlsDisabled}
								onChange={(e) => {
									const f = e.target.files?.[0]
									if (f) handleFile(f)
									e.target.value = ""
								}}
							/>
						</>
					)}

					{!isTrackingMode && isProcessing && (
						<PdfIngestionProgressView
							status={jobStatus}
							documentType={documentType}
						/>
					)}

					{!isTrackingMode && error && (
						<div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
							<XCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
							<div className="min-w-0 flex-1">
								<p className="text-sm text-destructive">{error}</p>
								<button
									type="button"
									onClick={() => setError(null)}
									className="mt-1 text-xs underline underline-offset-2 text-destructive/70"
								>
									Dismiss
								</button>
							</div>
						</div>
					)}
				</div>

				<DrawerFooter className="pt-2">
					{!isTrackingMode &&
						!isProcessing &&
						!uploading &&
						!checking &&
						!archiving &&
						!isConfirming && (
							<DrawerClose asChild>
								<Button variant="outline" className="w-full">
									Cancel
								</Button>
							</DrawerClose>
						)}
					{!isTrackingMode && isProcessing && jobStatus !== "ocr_complete" && (
						<p className="text-center text-xs text-muted-foreground pb-1">
							Please keep this page open while processing.
						</p>
					)}
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	)
}

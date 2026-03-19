"use client"

import { Button } from "@/components/ui/button"
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import {
	archiveExistingDocument,
	checkExistingDocument,
	createLinkedPdfUpload,
	getPdfIngestionJobStatus,
} from "@/lib/pdf-ingestion-actions"
import { AlertTriangle, CheckCircle2, Upload, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

type DocumentType = "mark_scheme" | "exemplar" | "question_paper"

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

type ProcessingStep = { label: string; detail: string; progress: number }

const STATUS_STEPS: Record<string, ProcessingStep> = {
	pending: { label: "Queued", detail: "Waiting to start…", progress: 10 },
	processing: {
		label: "Reading PDF",
		detail: "Extracting questions and criteria…",
		progress: 40,
	},
	extracting: {
		label: "Extracting data",
		detail: "Structuring questions and mark points…",
		progress: 70,
	},
	extracted: {
		label: "Finalising",
		detail: "Saving and running quality checks…",
		progress: 90,
	},
	ocr_complete: { label: "Complete", detail: "All done!", progress: 100 },
}

function ProcessingView({
	status,
	documentType,
}: {
	status: string | null
	documentType: DocumentType
}) {
	const step = status
		? (STATUS_STEPS[status] ?? STATUS_STEPS.pending)
		: STATUS_STEPS.pending
	const docLabel =
		documentType === "mark_scheme"
			? "mark scheme"
			: documentType === "question_paper"
				? "question paper"
				: "exemplar"

	return (
		<div className="space-y-4 py-2">
			<div className="flex items-center gap-3">
				{step.progress === 100 ? (
					<CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
				) : (
					<Spinner className="h-5 w-5 shrink-0" />
				)}
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium">{step.label}</p>
					<p className="text-xs text-muted-foreground">{step.detail}</p>
				</div>
			</div>
			<Progress value={step.progress} className="h-2" />
			<div className="space-y-1.5">
				{Object.entries(STATUS_STEPS)
					.filter(([key]) => key !== "ocr_complete")
					.map(([key, s]) => {
						const isComplete = s.progress < step.progress
						const isActive = s.progress === step.progress
						return (
							<div key={key} className="flex items-center gap-2 text-xs">
								<span
									className={`h-1.5 w-1.5 shrink-0 rounded-full ${
										isComplete
											? "bg-green-500"
											: isActive
												? "bg-primary"
												: "bg-muted-foreground/30"
									}`}
								/>
								<span
									className={
										isComplete
											? "text-muted-foreground line-through"
											: isActive
												? "font-medium"
												: "text-muted-foreground/50"
									}
								>
									{s.label}
								</span>
							</div>
						)
					})}
			</div>
			<p className="text-xs text-muted-foreground">
				Processing your {docLabel} PDF. Usually takes 30–90 seconds.
			</p>
		</div>
	)
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

export function UploadPdfDrawer({ examPaperId }: { examPaperId: string }) {
	const [open, setOpen] = useState(false)
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

	const fileInputRef = useRef<HTMLInputElement>(null)
	const router = useRouter()

	const isConfirming = pendingFile !== null && existingInfo !== null
	const isProcessing = !!jobId && jobStatus !== "failed"

	const handleComplete = useCallback(() => {
		setOpen(false)
		router.refresh()
	}, [router])

	const pollStatus = useCallback(
		async (id: string) => {
			const result = await getPdfIngestionJobStatus(id)
			if (!result.ok) return
			setJobStatus(result.status)
			if (result.status === "ocr_complete") handleComplete()
			if (result.status === "failed") {
				setError(result.error ?? "Processing failed. Please try again.")
			}
		},
		[handleComplete],
	)

	useEffect(() => {
		if (!jobId || jobStatus === "ocr_complete" || jobStatus === "failed") return
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
		const check = await checkExistingDocument(examPaperId, documentType)
		setChecking(false)

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
	}

	async function handleConfirmReplace() {
		if (!pendingFile) return
		setArchiving(true)
		const result = await archiveExistingDocument(examPaperId, documentType)
		setArchiving(false)

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

	function handleOpenChange(next: boolean) {
		if (!next && isProcessing) return
		setOpen(next)
		if (!next) reset()
	}

	const showSelector = !isConfirming && !isProcessing && !uploading && !checking
	const isBusy = checking || archiving || uploading

	return (
		<Drawer open={open} onOpenChange={handleOpenChange}>
			<DrawerTrigger asChild>
				<Button size="sm">
					<Upload className="h-3.5 w-3.5 mr-1.5" />
					Upload PDF
				</Button>
			</DrawerTrigger>

			<DrawerContent className="max-h-[92dvh]">
				<DrawerHeader className="pb-2">
					<DrawerTitle>Upload PDF</DrawerTitle>
					<DrawerDescription>
						Add a mark scheme, question paper, or exemplar to this exam paper.
					</DrawerDescription>
				</DrawerHeader>

				<div className="flex-1 overflow-y-auto px-4 pb-2 space-y-4">
					{checking && (
						<div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
							<Spinner className="h-4 w-4" />
							<span>Checking for existing uploads…</span>
						</div>
					)}

					{isConfirming && existingInfo && (
						<ReplaceConfirmView
							documentType={documentType}
							existingInfo={existingInfo}
							onConfirm={handleConfirmReplace}
							onCancel={handleCancelReplace}
							archiving={archiving}
						/>
					)}

					{showSelector && (
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
										className="shrink-0"
									/>
								</div>
							)}

							<button
								type="button"
								onClick={() => fileInputRef.current?.click()}
								className="w-full flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-input bg-muted/20 py-10 gap-3 transition-colors active:bg-muted/40"
							>
								<Upload className="h-7 w-7 text-muted-foreground" />
								<div className="text-center">
									<p className="text-sm font-medium">Tap to select a PDF</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										PDF files only
									</p>
								</div>
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
						</>
					)}

					{uploading && (
						<div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
							<Spinner className="h-4 w-4" />
							<span>Uploading…</span>
						</div>
					)}

					{isProcessing && (
						<ProcessingView status={jobStatus} documentType={documentType} />
					)}

					{error && (
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
					{!isProcessing && !isBusy && !isConfirming && (
						<DrawerClose asChild>
							<Button variant="outline" className="w-full">
								Cancel
							</Button>
						</DrawerClose>
					)}
					{isProcessing && jobStatus !== "ocr_complete" && (
						<p className="text-center text-xs text-muted-foreground pb-1">
							Please keep this page open while processing.
						</p>
					)}
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	)
}

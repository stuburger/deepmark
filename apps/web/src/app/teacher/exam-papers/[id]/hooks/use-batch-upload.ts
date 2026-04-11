import {
	addFileToBatch,
	createBatchIngestJob,
	triggerClassification,
	updateBatchJobSettings,
} from "@/lib/batch/mutations"
import { getBatchIngestJob } from "@/lib/batch/queries"
import { validateScriptFile } from "@/lib/upload-validation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

export type Phase = "upload" | "classifying"

export type FileItem = {
	name: string
	mimeType: string
	uploading: boolean
	error: string | null
}

type UseBatchUploadParams = {
	examPaperId: string
	onOpenChange: (open: boolean) => void
	onBatchStarted?: () => void
}

export function useBatchUpload({
	examPaperId,
	onOpenChange,
	onBatchStarted,
}: UseBatchUploadParams) {
	const [phase, setPhase] = useState<Phase>("upload")
	const [files, setFiles] = useState<FileItem[]>([])
	const [batchJobId, setBatchJobId] = useState<string | null>(null)
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

	// ── Polling ───────────────────────────────────────────────────────────────

	function startPolling(jobId: string) {
		stopPolling()
		pollRef.current = setInterval(async () => {
			const result = await getBatchIngestJob(jobId)
			if (!result.ok) return

			// Classification done — close dialog and hand off to StagingReviewDialog
			if (
				result.batch.status === "staging" ||
				result.batch.status === "marking" ||
				result.batch.status === "complete"
			) {
				stopPolling()
				handleOpenChange(false)
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: cleanup-only effect — stopPolling is stable via ref
	useEffect(() => {
		return () => stopPolling()
	}, [])

	// ── Reset on close ────────────────────────────────────────────────────────

	function handleOpenChange(next: boolean) {
		if (!next) {
			stopPolling()
			setPhase("upload")
			setFiles([])
			setBatchJobId(null)
			setShowAdvanced(false)
			setAutoCommit(false)
			setBlankPageMode("script_page")
			setPagesPerScript(4)
			setClassificationMode("auto")
		}
		onOpenChange(next)
	}

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

		// Validate all files before starting any uploads
		const valid: File[] = []
		const rejected: FileItem[] = []
		for (const file of incoming) {
			const result = validateScriptFile(file)
			if (result.ok) {
				valid.push(file)
			} else {
				rejected.push({
					name: file.name,
					mimeType: file.type || "application/octet-stream",
					uploading: false,
					error: result.error,
				})
			}
		}

		if (rejected.length > 0) {
			setFiles((prev) => [...prev, ...rejected])
			if (valid.length === 0) return
		}

		const newItems: FileItem[] = valid.map((f) => ({
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

		for (const file of valid) {
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

	function handleUpdateSettings(
		settings: Parameters<typeof updateBatchJobSettings>[1],
	) {
		if (batchJobId) {
			void updateBatchJobSettings(batchJobId, settings)
		}
	}

	// ── Derived values ────────────────────────────────────────────────────────

	const isUploading = files.some((f) => f.uploading)
	const hasErrors = files.some((f) => f.error !== null)
	const canStart = files.length > 0 && !isUploading && !hasErrors

	return {
		phase,
		files,
		setFiles,
		fileInputRef,
		batchJobId,
		showAdvanced,
		setShowAdvanced,
		autoCommit,
		setAutoCommit,
		blankPageMode,
		setBlankPageMode,
		pagesPerScript,
		setPagesPerScript,
		classificationMode,
		setClassificationMode,
		isUploading,
		hasErrors,
		canStart,
		handleOpenChange,
		handleFiles,
		handleStartClassifying,
		handleUpdateSettings,
	}
}

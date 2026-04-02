import {
	addFileToBatch,
	commitBatch,
	createBatchIngestJob,
	splitStagedScript,
	triggerClassification,
	updateBatchJobSettings,
	updateStagedScript,
} from "@/lib/batch/mutations"
import { getBatchIngestJob } from "@/lib/batch/queries"
import type { BatchIngestJobData } from "@/lib/batch/types"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

export type Phase = "upload" | "classifying" | "staging" | "marking" | "done"

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

	// ── Reset on close ────────────────────────────────────────────────────────

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

	async function handleSplitScript(
		scriptId: string,
		splitAfterIndex: number,
	) {
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

	async function handleRefreshBatch() {
		if (batchJobId) {
			const result = await getBatchIngestJob(batchJobId)
			if (result.ok) setBatchData(result.batch)
		}
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
		batchData?.student_jobs.filter((j) => j.status === "ocr_complete")
			.length ?? 0

	return {
		phase,
		files,
		setFiles,
		fileInputRef,
		batchData,
		batchJobId,
		committing,
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
		confirmedCount,
		proposedCount,
		oversizedCount,
		totalJobs,
		completeJobs,
		handleOpenChange,
		handleFiles,
		handleStartClassifying,
		handleUpdateName,
		handleToggleExclude,
		handleConfirmAll,
		handleSplitScript,
		handleCommit,
		handleRefreshBatch,
		handleUpdateSettings,
	}
}

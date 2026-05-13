"use client"

import { Button } from "@/components/ui/button"
import {
	classifyStagedFiles,
	createPaperFromStaged,
} from "@/lib/paper-setup/actions"
import type {
	CommittableStagedFileLabel,
	StagedFileLabel,
} from "@/lib/paper-setup/types"
import { requestMetadataUpload } from "@/lib/pdf-ingestion/metadata"
import { validatePdfFile } from "@/lib/upload-validation"
import { useMutation } from "@tanstack/react-query"
import { Upload } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { StagedFilesList, type StagedFileRow } from "./staged-files-list"

type CommittableFile = StagedFileRow & {
	tempUploadId: string
	label: CommittableStagedFileLabel
}

function isCommittable(row: StagedFileRow): row is CommittableFile {
	return (
		row.tempUploadId !== null &&
		row.label !== null &&
		row.label !== "unrecognised"
	)
}

export function NewPaperUploadClient() {
	const router = useRouter()
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [dragOver, setDragOver] = useState(false)
	const [files, setFiles] = useState<StagedFileRow[]>([])

	const goMutation = useMutation({
		mutationFn: async () => {
			const ready = files.filter(isCommittable)
			const result = await createPaperFromStaged({
				files: ready.map((f) => ({
					tempUploadId: f.tempUploadId,
					label: f.label,
					filename: f.filename,
				})),
			})
			if (result?.serverError) throw new Error(result.serverError)
			if (!result?.data) throw new Error("Failed to create session")
			return result.data
		},
		onSuccess: ({ sessionId }) => {
			router.push(`/teacher/sessions/${sessionId}`)
		},
		onError: (err) => {
			toast.error(err.message)
		},
	})

	async function handleFiles(picked: FileList | File[]) {
		const arr = Array.from(picked)
		const validated: StagedFileRow[] = []
		for (const file of arr) {
			const v = validatePdfFile(file)
			if (!v.ok) {
				toast.error(`${file.name}: ${v.error}`)
				continue
			}
			validated.push({
				clientId: crypto.randomUUID(),
				filename: file.name,
				tempUploadId: null,
				status: "uploading",
				label: null,
				error: null,
			})
		}
		if (validated.length === 0) return
		setFiles((prev) => [...prev, ...validated])

		await Promise.all(
			arr.map(async (file, i) => {
				const slot = validated[i]
				if (!slot) return
				try {
					const upload = await requestMetadataUpload()
					const data = upload?.data
					if (!data) throw new Error("Could not request upload")
					const putRes = await fetch(data.url, {
						method: "PUT",
						body: file,
						headers: { "Content-Type": "application/pdf" },
					})
					if (!putRes.ok) throw new Error("S3 upload failed")
					updateFile(slot.clientId, (f) => ({
						...f,
						tempUploadId: data.s3Key,
						status: "classifying",
					}))
					const classifyRes = await classifyStagedFiles({
						files: [{ tempUploadId: data.s3Key }],
					})
					if (classifyRes?.serverError) throw new Error(classifyRes.serverError)
					const cls = classifyRes?.data?.classifications[0]
					if (!cls) throw new Error("Classifier returned no result")
					updateFile(slot.clientId, (f) => ({
						...f,
						label: cls.label,
						status: cls.error ? "error" : "classified",
						error: cls.error,
					}))
				} catch (err) {
					const message = err instanceof Error ? err.message : "Upload failed"
					updateFile(slot.clientId, (f) => ({
						...f,
						status: "error",
						error: message,
					}))
				}
			}),
		)
	}

	function updateFile(
		clientId: string,
		mut: (f: StagedFileRow) => StagedFileRow,
	) {
		setFiles((prev) => prev.map((f) => (f.clientId === clientId ? mut(f) : f)))
	}

	function removeFile(clientId: string) {
		setFiles((prev) => prev.filter((f) => f.clientId !== clientId))
	}

	function reassignFile(clientId: string, label: StagedFileLabel) {
		updateFile(clientId, (f) => ({ ...f, label, status: "classified" }))
	}

	const qpCount = files.filter((f) => f.label === "question_paper").length
	const msCount = files.filter((f) => f.label === "mark_scheme").length
	const scriptsCount = files.filter((f) => f.label === "scripts_bundle").length
	const anyBusy = files.some(
		(f) => f.status === "uploading" || f.status === "classifying",
	)
	const goError = (() => {
		if (anyBusy) return "Wait for classification to finish."
		if (qpCount !== 1) return "Drop in one question paper."
		if (msCount !== 1)
			return "Drop in one mark scheme alongside the question paper."
		if (scriptsCount > 1) return "Only one scripts PDF allowed."
		return null
	})()

	return (
		<div className="space-y-4">
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: drop zone — hidden input handles keyboard */}
			<div
				onDragOver={(e) => {
					e.preventDefault()
					setDragOver(true)
				}}
				onDragLeave={(e) => {
					e.preventDefault()
					setDragOver(false)
				}}
				onDrop={(e) => {
					e.preventDefault()
					setDragOver(false)
					void handleFiles(e.dataTransfer.files)
				}}
				onClick={() => fileInputRef.current?.click()}
				className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center cursor-pointer transition-colors select-none ${
					dragOver
						? "border-primary bg-primary/5"
						: "border-border hover:border-primary/50 hover:bg-muted/30"
				}`}
			>
				<div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-4">
					<Upload className="h-7 w-7 text-primary" />
				</div>
				<p className="text-sm font-medium text-foreground">
					Drop in your question paper, mark scheme, and scripts
				</p>
				<p className="text-xs text-muted-foreground mt-1">
					or click to browse · PDFs only
				</p>
			</div>
			<input
				ref={fileInputRef}
				type="file"
				accept=".pdf,application/pdf"
				multiple
				className="sr-only"
				onChange={(e) => {
					if (e.target.files) void handleFiles(e.target.files)
					e.target.value = ""
				}}
			/>

			<StagedFilesList
				files={files}
				onReassign={reassignFile}
				onRemove={removeFile}
			/>

			<div className="flex items-center justify-end gap-3">
				{goError && (
					<p className="text-xs text-muted-foreground">{goError}</p>
				)}
				<Button
					disabled={goError !== null || goMutation.isPending}
					onClick={() => goMutation.mutate()}
				>
					{goMutation.isPending ? "Setting up…" : "Go"}
				</Button>
			</div>
		</div>
	)
}

"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import {
	createLinkedPdfUpload,
	getPdfIngestionJobStatus,
} from "@/lib/pdf-ingestion-actions"
import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { CheckCircle2, Upload } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

type DocumentType = "mark_scheme" | "exemplar" | "question_paper"

type ProcessingStep = {
	label: string
	detail: string
	progress: number
}

const STATUS_STEPS: Record<string, ProcessingStep> = {
	pending: {
		label: "Queued",
		detail: "Waiting to start…",
		progress: 10,
	},
	processing: {
		label: "Reading PDF",
		detail:
			"Gemini is extracting questions and mark scheme criteria from the document…",
		progress: 40,
	},
	extracting: {
		label: "Extracting data",
		detail: "Structuring questions, mark points, and metadata…",
		progress: 70,
	},
	extracted: {
		label: "Finalising",
		detail: "Saving questions and running quality checks…",
		progress: 90,
	},
	ocr_complete: {
		label: "Complete",
		detail: "All done! Redirecting…",
		progress: 100,
	},
}

function ProcessingStatus({
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
				<div className="flex-1">
					<p className="text-sm font-medium">{step.label}</p>
					<p className="text-xs text-muted-foreground">{step.detail}</p>
				</div>
			</div>
			<Progress value={step.progress} className="h-2" />
			<div className="space-y-1">
				{Object.entries(STATUS_STEPS).map(([key, s]) => {
					const currentProgress = step.progress
					const isComplete = s.progress < currentProgress
					const isActive = s.progress === currentProgress
					const isPending = s.progress > currentProgress
					if (key === "ocr_complete") return null
					return (
						<div key={key} className="flex items-center gap-2 text-xs">
							<span
								className={`h-1.5 w-1.5 rounded-full shrink-0 ${
									isComplete
										? "bg-green-500"
										: isActive
											? "bg-primary"
											: isPending
												? "bg-muted-foreground/30"
												: "bg-muted-foreground/30"
								}`}
							/>
							<span
								className={
									isComplete
										? "text-muted-foreground line-through"
										: isActive
											? "font-medium"
											: "text-muted-foreground/60"
								}
							>
								{s.label}
							</span>
						</div>
					)
				})}
			</div>
			<p className="text-xs text-muted-foreground">
				Processing your {docLabel} PDF. This usually takes 30–90 seconds.
			</p>
		</div>
	)
}

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

function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1)
}

export function LinkedPdfUploadClient({
	examPaperId,
	examPaperTitle,
	subject,
	examBoard,
	year,
}: {
	examPaperId: string
	examPaperTitle: string
	subject: string
	examBoard: string | null
	year: number
}) {
	const router = useRouter()
	const fileInputRef = useRef<HTMLInputElement>(null)

	const [documentType, setDocumentType] = useState<DocumentType>("mark_scheme")
	const [uploading, setUploading] = useState(false)
	const [jobId, setJobId] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [retrying, setRetrying] = useState(false)

	// Poll the ingestion job status while it's active
	const { data: jobStatusData } = useQuery({
		queryKey: queryKeys.ingestionJob(jobId ?? ""),
		queryFn: async () => {
			if (!jobId) return null
			const result = await getPdfIngestionJobStatus(jobId)
			if (!result.ok) return null
			return result
		},
		enabled: !!jobId,
		refetchInterval: (q) => {
			const status = q.state.data?.status
			if (!status || status === "ocr_complete" || status === "failed")
				return false
			return 3000
		},
	})

	const jobStatus = jobStatusData?.status ?? null

	// Navigate when complete; surface error when failed
	useEffect(() => {
		if (jobStatus === "ocr_complete") {
			router.push(`/teacher/exam-papers/${examPaperId}`)
		}
		if (jobStatus === "failed" && jobStatusData?.error) {
			setError(jobStatusData.error ?? "Processing failed. Please try again.")
		}
	}, [jobStatus, jobStatusData?.error, examPaperId, router])

	async function handleFile(file: File) {
		if (!file.type.includes("pdf")) {
			setError("Please select a PDF file.")
			return
		}
		setError(null)
		setUploading(true)
		try {
			const result = await createLinkedPdfUpload({
				exam_paper_id: examPaperId,
				document_type: documentType,
				run_adversarial_loop: false,
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
			router.push(`/admin/upload/${result.jobId}`)
		} catch {
			setError("Upload failed. Please try again.")
		} finally {
			setUploading(false)
		}
	}

	async function handleRetry() {
		if (!fileInputRef.current) return
		setRetrying(true)
		setError(null)
		setJobId(null)
		setJobStatus(null)
		fileInputRef.current.value = ""
		setRetrying(false)
	}

	const isProcessing = !!jobId && jobStatus !== "failed" && !uploading

	return (
		<div className="max-w-xl space-y-6">
			<div>
				<Link
					href={`/teacher/exam-papers/${examPaperId}`}
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← Back to {examPaperTitle}
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">Upload PDF</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Add a mark scheme, question paper, or exemplar to this exam paper.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Exam paper</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="font-medium">{examPaperTitle}</p>
					<div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
						<Badge variant="secondary">{capitalize(subject)}</Badge>
						{examBoard && <span>{examBoard}</span>}
						<span>{year}</span>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Upload PDF</CardTitle>
					<CardDescription>
						Select the type of document then drop your PDF. Subject, board and
						year are taken from the exam paper above.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<p className="text-sm font-medium">Document type</p>
						<div className="space-y-2">
							{DOCUMENT_TYPES.map((dt) => (
								<label
									key={dt.value}
									className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
										documentType === dt.value
											? "border-primary bg-primary/5"
											: "hover:bg-muted/50"
									}`}
								>
									<input
										type="radio"
										name="document_type"
										value={dt.value}
										checked={documentType === dt.value}
										onChange={() => setDocumentType(dt.value)}
										className="mt-0.5"
										disabled={isProcessing || uploading}
									/>
									<div>
										<p className="text-sm font-medium">{dt.label}</p>
										<p className="text-xs text-muted-foreground">
											{dt.description}
										</p>
									</div>
								</label>
							))}
						</div>
					</div>

					{!isProcessing && (
						<>
							<label
								htmlFor="pdf-file"
								className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-input p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
							>
								<Upload className="h-8 w-8 mb-2 text-muted-foreground" />
								<p className="text-sm font-medium">Click to select a PDF</p>
								<p className="text-xs text-muted-foreground mt-1">
									or drag and drop
								</p>
							</label>
							<input
								ref={fileInputRef}
								id="pdf-file"
								type="file"
								accept=".pdf,application/pdf"
								className="sr-only"
								disabled={uploading}
								onChange={(e) => {
									const f = e.target.files?.[0]
									if (f) handleFile(f)
								}}
							/>
						</>
					)}

					{uploading && (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Spinner className="h-4 w-4" />
							<span>Uploading…</span>
						</div>
					)}

					{isProcessing && (
						<ProcessingStatus status={jobStatus} documentType={documentType} />
					)}

					{error && (
						<div className="space-y-2">
							<p className="text-sm text-destructive">{error}</p>
							<Button
								size="sm"
								variant="outline"
								onClick={handleRetry}
								disabled={retrying}
							>
								{retrying ? "Resetting…" : "Try again"}
							</Button>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
}

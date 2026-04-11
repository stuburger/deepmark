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
import { Spinner } from "@/components/ui/spinner"
import { getPdfIngestionJobStatus } from "@/lib/pdf-ingestion/job-lifecycle"
import { putToPresignedUrl } from "@/lib/pdf-ingestion/presigned-upload"
import { createLinkedPdfUpload } from "@/lib/pdf-ingestion/upload"
import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { Upload } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { ProcessingStatus } from "./processing-status"

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
	// {
	// 	value: "exemplar",
	// 	label: "Exemplar memo",
	// 	description: "Adds exemplar student answers",
	// },
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
			await putToPresignedUrl(result.url, file)
			setJobId(result.jobId)
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

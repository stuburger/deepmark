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
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
	type CatalogExamPaper,
	listCatalogExamPapers,
} from "@/lib/dashboard-actions"
import {
	createStudentPaperUpload,
	getStudentPaperResult,
} from "@/lib/mark-actions"
import { CheckCircle2, Search, Upload } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

type Step = "select-paper" | "upload" | "processing"

function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1)
}

function subjectColor(subject: string) {
	switch (subject) {
		case "biology":
			return "secondary" as const
		case "chemistry":
			return "default" as const
		case "physics":
			return "outline" as const
		case "english":
			return "secondary" as const
		default:
			return "outline" as const
	}
}

export default function MarkNewPage() {
	const router = useRouter()
	const fileInputRef = useRef<HTMLInputElement>(null)

	const [step, setStep] = useState<Step>("select-paper")
	const [papers, setPapers] = useState<CatalogExamPaper[]>([])
	const [loadingPapers, setLoadingPapers] = useState(true)
	const [search, setSearch] = useState("")
	const [selectedPaper, setSelectedPaper] = useState<CatalogExamPaper | null>(
		null,
	)
	const [uploading, setUploading] = useState(false)
	const [jobId, setJobId] = useState<string | null>(null)
	const [processingStatus, setProcessingStatus] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		listCatalogExamPapers().then((result) => {
			if (result.ok) setPapers(result.papers)
			setLoadingPapers(false)
		})
	}, [])

	const filteredPapers = papers.filter((p) => {
		if (!search.trim()) return true
		const q = search.toLowerCase()
		return (
			p.title.toLowerCase().includes(q) ||
			p.subject.toLowerCase().includes(q) ||
			(p.exam_board ?? "").toLowerCase().includes(q) ||
			String(p.year).includes(q)
		)
	})

	const pollStatus = useCallback(
		async (id: string) => {
			const result = await getStudentPaperResult(id)
			if (!result.ok) return
			setProcessingStatus(result.data.status)
			if (result.data.status === "ocr_complete") {
				router.push(`/teacher/mark/${id}`)
			}
			if (result.data.status === "failed") {
				setError(result.data.error ?? "Processing failed")
				setStep("upload")
			}
		},
		[router],
	)

	useEffect(() => {
		if (
			!jobId ||
			processingStatus === "ocr_complete" ||
			processingStatus === "failed"
		)
			return
		const interval = setInterval(() => pollStatus(jobId), 3000)
		return () => clearInterval(interval)
	}, [jobId, processingStatus, pollStatus])

	async function handleUpload(file: File) {
		if (!selectedPaper) return
		if (!file.type.includes("pdf")) {
			setError("Please select a PDF file")
			return
		}
		setError(null)
		setUploading(true)
		try {
			const result = await createStudentPaperUpload(selectedPaper.id)
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
				setError("Upload failed. Please try again.")
				return
			}
			setJobId(result.jobId)
			setStep("processing")
			pollStatus(result.jobId)
		} catch {
			setError("Upload failed. Please try again.")
		} finally {
			setUploading(false)
		}
	}

	if (step === "processing") {
		return (
			<div className="max-w-xl mx-auto mt-16 text-center space-y-4">
				<Spinner className="mx-auto h-10 w-10" />
				<h2 className="text-xl font-semibold">
					Extracting and marking answers…
				</h2>
				<p className="text-sm text-muted-foreground">
					Gemini is reading the student paper and grading each answer against
					the mark scheme. This usually takes 20–60 seconds.
				</p>
				{selectedPaper && (
					<p className="text-sm text-muted-foreground">
						Paper: <span className="font-medium">{selectedPaper.title}</span>
					</p>
				)}
			</div>
		)
	}

	return (
		<div className="max-w-2xl space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Mark a paper</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Select the exam paper, then upload a student&apos;s answer sheet as a
					PDF.
				</p>
			</div>

			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<span
							className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${selectedPaper ? "bg-green-500 text-white" : "bg-primary text-primary-foreground"}`}
						>
							{selectedPaper ? <CheckCircle2 className="h-4 w-4" /> : "1"}
						</span>
						<CardTitle>Select exam paper</CardTitle>
					</div>
					<CardDescription>Choose the paper this student sat.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{selectedPaper ? (
						<div className="flex items-center justify-between rounded-lg border p-3">
							<div>
								<p className="font-medium text-sm">{selectedPaper.title}</p>
								<div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
									<Badge
										variant={subjectColor(selectedPaper.subject)}
										className="text-xs"
									>
										{capitalize(selectedPaper.subject)}
									</Badge>
									{selectedPaper.exam_board && (
										<span>{selectedPaper.exam_board}</span>
									)}
									<span>{selectedPaper.year}</span>
									<span>{selectedPaper.total_marks} marks</span>
								</div>
							</div>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => {
									setSelectedPaper(null)
									setStep("select-paper")
								}}
							>
								Change
							</Button>
						</div>
					) : (
						<>
							<div className="relative">
								<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									className="pl-9"
									placeholder="Search by title, subject, board or year…"
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									autoFocus
								/>
							</div>
							{loadingPapers ? (
								<p className="py-4 text-center text-sm text-muted-foreground">
									Loading papers…
								</p>
							) : filteredPapers.length === 0 ? (
								<p className="py-4 text-center text-sm text-muted-foreground">
									No published exam papers found.{" "}
									{search && "Try a different search."}
								</p>
							) : (
								<div className="max-h-72 overflow-y-auto space-y-1 rounded-md border p-1">
									{filteredPapers.map((paper) => (
										<button
											key={paper.id}
											type="button"
											className="w-full rounded-md px-3 py-2 text-left hover:bg-muted transition-colors"
											onClick={() => {
												setSelectedPaper(paper)
												setStep("upload")
											}}
										>
											<p className="text-sm font-medium">{paper.title}</p>
											<div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
												<Badge
													variant={subjectColor(paper.subject)}
													className="text-xs"
												>
													{capitalize(paper.subject)}
												</Badge>
												{paper.exam_board && <span>{paper.exam_board}</span>}
												<span>{paper.year}</span>
												<span>{paper.total_marks} marks</span>
												{paper.question_count > 0 && (
													<span>{paper.question_count} questions</span>
												)}
											</div>
										</button>
									))}
								</div>
							)}
						</>
					)}
				</CardContent>
			</Card>

			<Card className={!selectedPaper ? "opacity-50 pointer-events-none" : ""}>
				<CardHeader>
					<div className="flex items-center gap-2">
						<span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold bg-muted text-muted-foreground">
							2
						</span>
						<CardTitle>Upload student paper</CardTitle>
					</div>
					<CardDescription>
						Upload the student&apos;s handwritten or typed answer sheet as a
						single PDF. No student name needed — it will be detected
						automatically.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<label
						className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-input p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
						htmlFor="student-pdf"
					>
						<Upload className="h-8 w-8 mb-2 text-muted-foreground" />
						<p className="text-sm font-medium">Click to select a PDF</p>
						<p className="text-xs text-muted-foreground mt-1">
							or drag and drop
						</p>
					</label>
					<input
						ref={fileInputRef}
						id="student-pdf"
						type="file"
						accept=".pdf,application/pdf"
						className="sr-only"
						disabled={uploading || !selectedPaper}
						onChange={(e) => {
							const f = e.target.files?.[0]
							if (f) handleUpload(f)
						}}
					/>
					{uploading && (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Spinner className="h-4 w-4" />
							<span>Uploading…</span>
						</div>
					)}
					{error && <p className="text-sm text-destructive">{error}</p>}
				</CardContent>
			</Card>
		</div>
	)
}

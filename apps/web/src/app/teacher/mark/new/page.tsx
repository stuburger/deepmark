"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
	type CatalogExamPaper,
	listCatalogExamPapers,
} from "@/lib/dashboard-actions"
import {
	addPageToJob,
	createStudentPaperJob,
	getStudentPaperJob,
	removePageFromJob,
	reorderPages,
	triggerGrading,
	triggerOcr,
} from "@/lib/mark-actions"
import {
	type StudentItem,
	confirmStudentForSubmission,
	createAndConfirmStudent,
	listStudents,
} from "@/lib/student-actions"
import {
	AlertCircle,
	ArrowDown,
	ArrowUp,
	Camera,
	CheckCircle2,
	FileText,
	Search,
	Trash2,
	Upload,
	UserCheck,
	UserPlus,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

type Step =
	| "upload"
	| "processing-ocr"
	| "confirm-student"
	| "select-paper"
	| "processing-grade"

type PageItem = {
	key: string
	order: number
	mimeType: string
	previewUrl: string | null
	uploading: boolean
	error: string | null
}

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

function PageThumbnail({
	page,
	index,
	total,
	onMoveUp,
	onMoveDown,
	onRemove,
}: {
	page: PageItem
	index: number
	total: number
	onMoveUp: () => void
	onMoveDown: () => void
	onRemove: () => void
}) {
	const isImage = page.mimeType.startsWith("image/")
	return (
		<div className="flex items-center gap-3 rounded-xl border bg-card p-3">
			<div className="h-16 w-12 shrink-0 rounded-md border overflow-hidden bg-muted flex items-center justify-center">
				{page.uploading ? (
					<Spinner className="h-5 w-5" />
				) : isImage && page.previewUrl ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={page.previewUrl}
						alt={`Page ${page.order}`}
						className="h-full w-full object-cover"
					/>
				) : (
					<FileText className="h-6 w-6 text-muted-foreground" />
				)}
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium">Page {index + 1}</p>
				{page.error && (
					<p className="text-xs text-destructive mt-0.5">{page.error}</p>
				)}
				{page.uploading && (
					<p className="text-xs text-muted-foreground mt-0.5">Uploading…</p>
				)}
			</div>
			<div className="flex flex-col gap-1">
				<button
					type="button"
					disabled={index === 0}
					onClick={onMoveUp}
					className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"
					aria-label="Move up"
				>
					<ArrowUp className="h-4 w-4" />
				</button>
				<button
					type="button"
					disabled={index === total - 1}
					onClick={onMoveDown}
					className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"
					aria-label="Move down"
				>
					<ArrowDown className="h-4 w-4" />
				</button>
			</div>
			<button
				type="button"
				onClick={onRemove}
				className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
				aria-label="Remove page"
			>
				<Trash2 className="h-4 w-4" />
			</button>
		</div>
	)
}

export default function MarkNewPage() {
	const router = useRouter()

	const cameraInputRef = useRef<HTMLInputElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const [step, setStep] = useState<Step>("upload")
	const [jobId, setJobId] = useState<string | null>(null)
	const [pages, setPages] = useState<PageItem[]>([])
	const [ocrError, setOcrError] = useState<string | null>(null)
	const [detectedSubject, setDetectedSubject] = useState<string | null>(null)

	const [papers, setPapers] = useState<CatalogExamPaper[]>([])
	const [loadingPapers, setLoadingPapers] = useState(false)
	const [search, setSearch] = useState("")
	const [selectedPaper, setSelectedPaper] = useState<CatalogExamPaper | null>(
		null,
	)
	const [gradingError, setGradingError] = useState<string | null>(null)
	const [pollStatus, setPollStatus] = useState<string | null>(null)

	// Student confirmation state
	const [detectedStudentName, setDetectedStudentName] = useState<string | null>(
		null,
	)
	const [existingStudents, setExistingStudents] = useState<StudentItem[]>([])
	const [studentSearch, setStudentSearch] = useState("")
	const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
		null,
	)
	const [newStudentName, setNewStudentName] = useState("")
	const [studentMode, setStudentMode] = useState<"select" | "create">("select")
	const [studentError, setStudentError] = useState<string | null>(null)
	const [confirmingStudent, setConfirmingStudent] = useState(false)

	// Ensure job is created once
	const jobIdRef = useRef<string | null>(null)

	async function ensureJob(): Promise<string> {
		if (jobIdRef.current) return jobIdRef.current
		const result = await createStudentPaperJob()
		if (!result.ok) throw new Error(result.error)
		jobIdRef.current = result.jobId
		setJobId(result.jobId)
		return result.jobId
	}

	async function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return
		const jid = await ensureJob()

		const newItems: PageItem[] = []
		const startOrder = pages.length + 1

		for (let i = 0; i < files.length; i++) {
			const file = files[i]
			if (!file) continue
			const order = startOrder + i
			const mimeType = file.type || "application/pdf"
			const previewUrl = mimeType.startsWith("image/")
				? URL.createObjectURL(file)
				: null

			const item: PageItem = {
				key: "",
				order,
				mimeType,
				previewUrl,
				uploading: true,
				error: null,
			}
			newItems.push(item)
		}

		setPages((prev) => [...prev, ...newItems])

		// Upload each file
		for (let i = 0; i < files.length; i++) {
			const file = files[i]
			if (!file) continue
			const order = startOrder + i
			const mimeType = file.type || "application/pdf"

			try {
				const result = await addPageToJob(jid, order, mimeType)
				if (!result.ok) throw new Error(result.error)

				const putRes = await fetch(result.uploadUrl, {
					method: "PUT",
					body: file,
					headers: { "Content-Type": mimeType },
				})
				if (!putRes.ok) throw new Error("Upload failed")

				setPages((prev) =>
					prev.map((p) =>
						p.order === order ? { ...p, key: result.key, uploading: false } : p,
					),
				)
			} catch (err) {
				setPages((prev) =>
					prev.map((p) =>
						p.order === order
							? {
									...p,
									uploading: false,
									error: err instanceof Error ? err.message : "Upload failed",
								}
							: p,
					),
				)
			}
		}
	}

	function movePage(index: number, direction: "up" | "down") {
		setPages((prev) => {
			const next = [...prev]
			const swapIndex = direction === "up" ? index - 1 : index + 1
			if (swapIndex < 0 || swapIndex >= next.length) return prev
			;[next[index], next[swapIndex]] = [next[swapIndex]!, next[index]!]
			const reordered = next.map((p, i) => ({ ...p, order: i + 1 }))
			// Persist to server async
			if (jobIdRef.current) {
				reorderPages(
					jobIdRef.current,
					reordered.map((p) => p.key).filter(Boolean),
				).catch(() => {})
			}
			return reordered
		})
	}

	async function handleRemovePage(index: number) {
		const page = pages[index]
		if (!page || !jobIdRef.current) return
		await removePageFromJob(jobIdRef.current, page.order)
		if (page.previewUrl) URL.revokeObjectURL(page.previewUrl)
		setPages((prev) => {
			const next = prev.filter((_, i) => i !== index)
			return next.map((p, i) => ({ ...p, order: i + 1 }))
		})
	}

	const isUploading = pages.some((p) => p.uploading)
	const hasErrors = pages.some((p) => p.error)
	const readyToProcess = pages.length > 0 && !isUploading && !hasErrors

	async function handleTriggerOcr() {
		if (!jobIdRef.current) return
		setOcrError(null)
		setStep("processing-ocr")
		const result = await triggerOcr(jobIdRef.current)
		if (!result.ok) {
			setOcrError(result.error)
			setStep("upload")
		}
	}

	const pollOcr = useCallback(async () => {
		if (!jobIdRef.current) return
		const result = await getStudentPaperJob(jobIdRef.current)
		if (!result.ok) return
		const { status, detected_subject, student_name } = result.data
		setPollStatus(status)
		if (status === "text_extracted") {
			setDetectedSubject(detected_subject)
			setDetectedStudentName(student_name)
			setNewStudentName(student_name ?? "")
			// Load existing students and papers in parallel
			void listStudents().then((r) => {
				if (r.ok) setExistingStudents(r.students)
			})
			setStep("confirm-student")
		}
		if (status === "failed") {
			setOcrError(result.data.error ?? "OCR failed")
			setStep("upload")
		}
	}, [])

	useEffect(() => {
		if (step !== "processing-ocr") return
		const interval = setInterval(pollOcr, 3000)
		return () => clearInterval(interval)
	}, [step, pollOcr])

	const filteredPapers = papers.filter((p) => {
		const matchesSubject = detectedSubject
			? p.subject === detectedSubject
			: true
		if (!search.trim()) return matchesSubject
		const q = search.toLowerCase()
		return (
			matchesSubject &&
			(p.title.toLowerCase().includes(q) ||
				p.subject.toLowerCase().includes(q) ||
				(p.exam_board ?? "").toLowerCase().includes(q) ||
				String(p.year).includes(q))
		)
	})

	const allPapers = papers.filter((p) => {
		if (!search.trim()) return true
		const q = search.toLowerCase()
		return (
			p.title.toLowerCase().includes(q) ||
			p.subject.toLowerCase().includes(q) ||
			(p.exam_board ?? "").toLowerCase().includes(q) ||
			String(p.year).includes(q)
		)
	})

	const showingFiltered =
		detectedSubject !== null && filteredPapers.length < allPapers.length

	function proceedToPaperSelect() {
		setStep("select-paper")
		setLoadingPapers(true)
		listCatalogExamPapers().then((r) => {
			if (r.ok) setPapers(r.papers)
			setLoadingPapers(false)
		})
	}

	async function handleConfirmStudent() {
		setStudentError(null)
		setConfirmingStudent(true)
		try {
			if (studentMode === "create") {
				if (!newStudentName.trim()) {
					setStudentError("Please enter a student name")
					return
				}
				// For PdfIngestionJob flow: just create the student record (linking happens in grade-scan.ts)
				// If we have a scan submission ID in future, we'd call createAndConfirmStudent
				const { createStudent } = await import("@/lib/student-actions")
				const result = await createStudent(newStudentName.trim())
				if (!result.ok) {
					setStudentError(result.error)
					return
				}
			} else if (studentMode === "select" && selectedStudentId) {
				// Student already exists — nothing to do here for PdfIngestionJob flow
				// grade-scan.ts will upsert by name match anyway
			}
			proceedToPaperSelect()
		} finally {
			setConfirmingStudent(false)
		}
	}

	async function handleTriggerGrading() {
		if (!jobIdRef.current || !selectedPaper) return
		setGradingError(null)
		setStep("processing-grade")
		const result = await triggerGrading(jobIdRef.current, selectedPaper.id)
		if (!result.ok) {
			setGradingError(result.error)
			setStep("select-paper")
		}
	}

	const pollGrading = useCallback(async () => {
		if (!jobIdRef.current) return
		const result = await getStudentPaperJob(jobIdRef.current)
		if (!result.ok) return
		const { status } = result.data
		setPollStatus(status)
		if (status === "ocr_complete") {
			router.push(`/teacher/mark/${jobIdRef.current}`)
		}
		if (status === "failed") {
			setGradingError(result.data.error ?? "Marking failed")
			setStep("select-paper")
		}
	}, [router])

	useEffect(() => {
		if (step !== "processing-grade") return
		const interval = setInterval(pollGrading, 3000)
		return () => clearInterval(interval)
	}, [step, pollGrading])

	// ─── Confirm student screen ───────────────────────────────────────────────

	if (step === "confirm-student") {
		const filteredStudents = existingStudents.filter((s) =>
			s.name.toLowerCase().includes(studentSearch.toLowerCase()),
		)

		return (
			<div className="flex flex-col min-h-[calc(100dvh-4rem)] max-w-lg mx-auto">
				<div className="flex-1 px-4 pt-4 pb-32 space-y-5">
					<div>
						<h1 className="text-2xl font-semibold">Who is this paper for?</h1>
						<p className="text-sm text-muted-foreground mt-1">
							Match to an existing student or create a new record.
						</p>
					</div>

					{/* Detected name chip */}
					{detectedStudentName && (
						<div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3">
							<CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
							<div className="flex-1 min-w-0">
								<p className="text-xs text-muted-foreground">
									Detected on paper
								</p>
								<p className="text-sm font-medium">{detectedStudentName}</p>
							</div>
						</div>
					)}

					{/* Mode toggle */}
					<div className="flex rounded-xl border overflow-hidden">
						<button
							type="button"
							onClick={() => setStudentMode("select")}
							className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
								studentMode === "select"
									? "bg-primary text-primary-foreground"
									: "bg-background text-muted-foreground hover:bg-muted"
							}`}
						>
							<UserCheck className="h-4 w-4" />
							Existing student
						</button>
						<button
							type="button"
							onClick={() => setStudentMode("create")}
							className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
								studentMode === "create"
									? "bg-primary text-primary-foreground"
									: "bg-background text-muted-foreground hover:bg-muted"
							}`}
						>
							<UserPlus className="h-4 w-4" />
							New student
						</button>
					</div>

					{studentMode === "select" && (
						<div className="space-y-3">
							<div className="relative">
								<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									className="pl-9"
									placeholder="Search students…"
									value={studentSearch}
									onChange={(e) => setStudentSearch(e.target.value)}
									autoFocus
								/>
							</div>
							{filteredStudents.length === 0 ? (
								<p className="text-sm text-muted-foreground text-center py-4">
									{existingStudents.length === 0
										? "No students yet — create one above."
										: "No students match your search."}
								</p>
							) : (
								<div className="space-y-2 max-h-72 overflow-y-auto">
									{filteredStudents.map((s) => (
										<button
											key={s.id}
											type="button"
											onClick={() => setSelectedStudentId(s.id)}
											className={`w-full rounded-xl border p-3.5 text-left transition-colors ${
												selectedStudentId === s.id
													? "border-primary bg-primary/5"
													: "bg-card active:bg-muted"
											}`}
										>
											<div className="flex items-center justify-between gap-2">
												<p className="text-sm font-medium">{s.name}</p>
												{selectedStudentId === s.id && (
													<CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
												)}
											</div>
											{(s.class_name || s.year_group) && (
												<p className="text-xs text-muted-foreground mt-0.5">
													{[s.class_name, s.year_group]
														.filter(Boolean)
														.join(" · ")}
												</p>
											)}
										</button>
									))}
								</div>
							)}
						</div>
					)}

					{studentMode === "create" && (
						<div className="space-y-3">
							<Input
								placeholder="Student full name"
								value={newStudentName}
								onChange={(e) => setNewStudentName(e.target.value)}
								autoFocus
							/>
						</div>
					)}

					{studentError && (
						<p className="text-sm text-destructive">{studentError}</p>
					)}
				</div>

				<div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur px-4 py-4 safe-area-inset-bottom">
					<div className="max-w-lg mx-auto space-y-2">
						<Button
							className="w-full h-14 text-base rounded-xl"
							disabled={
								confirmingStudent ||
								(studentMode === "select" && !selectedStudentId) ||
								(studentMode === "create" && !newStudentName.trim())
							}
							onClick={handleConfirmStudent}
						>
							{confirmingStudent ? (
								<>
									<Spinner className="mr-2 h-4 w-4" />
									Saving…
								</>
							) : (
								"Continue"
							)}
						</Button>
						<button
							type="button"
							onClick={proceedToPaperSelect}
							className="w-full text-center text-sm text-muted-foreground py-1"
						>
							Skip for now
						</button>
					</div>
				</div>
			</div>
		)
	}

	// ─── Processing screens ──────────────────────────────────────────────────

	if (step === "processing-ocr") {
		return (
			<div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-5">
				<Spinner className="h-12 w-12" />
				<div>
					<h2 className="text-xl font-semibold">Reading answer sheet…</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Extracting answers from {pages.length} page
						{pages.length !== 1 ? "s" : ""}. This takes around 15–30 seconds.
					</p>
				</div>
				{pollStatus && (
					<p className="text-xs text-muted-foreground">Status: {pollStatus}</p>
				)}
			</div>
		)
	}

	if (step === "processing-grade") {
		return (
			<div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-5">
				<Spinner className="h-12 w-12" />
				<div>
					<h2 className="text-xl font-semibold">Marking answers…</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Grading each answer against the mark scheme. Usually 20–60 seconds.
					</p>
					{selectedPaper && (
						<p className="text-sm text-muted-foreground mt-1">
							Paper: <span className="font-medium">{selectedPaper.title}</span>
						</p>
					)}
				</div>
				{pollStatus && (
					<p className="text-xs text-muted-foreground">Status: {pollStatus}</p>
				)}
			</div>
		)
	}

	// ─── Main flow ───────────────────────────────────────────────────────────

	return (
		<div className="flex flex-col min-h-[calc(100dvh-4rem)] max-w-lg mx-auto">
			{/* Content */}
			<div className="flex-1 px-4 pt-4 pb-32 space-y-5">
				{/* Header */}
				<div>
					<h1 className="text-2xl font-semibold">Mark a paper</h1>
					<p className="text-sm text-muted-foreground mt-1">
						{step === "upload"
							? "Photograph or upload each page of the student's answer sheet."
							: "Select the exam paper to mark against."}
					</p>
				</div>

				{step === "upload" && (
					<>
						{/* Upload buttons */}
						<div className="grid grid-cols-2 gap-3">
							<button
								type="button"
								onClick={() => cameraInputRef.current?.click()}
								className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-input bg-card p-6 text-center active:bg-muted transition-colors"
							>
								<Camera className="h-8 w-8 text-muted-foreground" />
								<span className="text-sm font-medium">Take photo</span>
								<span className="text-xs text-muted-foreground">
									Opens camera
								</span>
							</button>
							<button
								type="button"
								onClick={() => fileInputRef.current?.click()}
								className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-input bg-card p-6 text-center active:bg-muted transition-colors"
							>
								<Upload className="h-8 w-8 text-muted-foreground" />
								<span className="text-sm font-medium">Upload file</span>
								<span className="text-xs text-muted-foreground">
									PDF or image
								</span>
							</button>
						</div>

						{/* Hidden inputs */}
						<input
							ref={cameraInputRef}
							type="file"
							accept="image/*"
							capture="environment"
							multiple
							className="sr-only"
							onChange={(e) => handleFiles(e.target.files)}
						/>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*,application/pdf"
							multiple
							className="sr-only"
							onChange={(e) => handleFiles(e.target.files)}
						/>

						{/* Pages list */}
						{pages.length > 0 && (
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<p className="text-sm font-medium text-muted-foreground">
										{pages.length} page{pages.length !== 1 ? "s" : ""} added
									</p>
									<button
										type="button"
										onClick={() => fileInputRef.current?.click()}
										className="text-xs text-primary font-medium"
									>
										+ Add more
									</button>
								</div>
								<div className="space-y-2">
									{pages.map((page, index) => (
										<PageThumbnail
											key={page.order}
											page={page}
											index={index}
											total={pages.length}
											onMoveUp={() => movePage(index, "up")}
											onMoveDown={() => movePage(index, "down")}
											onRemove={() => handleRemovePage(index)}
										/>
									))}
								</div>
							</div>
						)}

						{ocrError && <p className="text-sm text-destructive">{ocrError}</p>}
					</>
				)}

				{step === "select-paper" && (
					<>
						{/* Detected subject chip */}
						{detectedSubject && (
							<div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3">
								<CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
								<div className="flex-1 min-w-0">
									<p className="text-xs text-muted-foreground">
										Detected subject
									</p>
									<p className="text-sm font-medium capitalize">
										{detectedSubject.replace("_", " ")}
									</p>
								</div>
								<Badge variant={subjectColor(detectedSubject)}>
									{capitalize(detectedSubject)}
								</Badge>
							</div>
						)}

						{/* Exam paper selector */}
						<div className="space-y-3">
							<div className="relative">
								<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									className="pl-9"
									placeholder="Search papers…"
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									autoFocus
								/>
							</div>

							{showingFiltered && (
								<button
									type="button"
									onClick={() => setDetectedSubject(null)}
									className="text-xs text-primary font-medium"
								>
									Show all subjects
								</button>
							)}

							{loadingPapers ? (
								<p className="py-4 text-center text-sm text-muted-foreground">
									Loading papers…
								</p>
							) : filteredPapers.length === 0 ? (
								<p className="py-4 text-center text-sm text-muted-foreground">
									No papers found.{" "}
									{showingFiltered && (
										<button
											type="button"
											onClick={() => setDetectedSubject(null)}
											className="text-primary font-medium"
										>
											Show all subjects?
										</button>
									)}
								</p>
							) : (
								<div className="space-y-2">
									{filteredPapers.map((paper) => {
										const isSelected = selectedPaper?.id === paper.id
										return (
											<button
												key={paper.id}
												type="button"
												disabled={!paper.has_mark_scheme}
												onClick={() => setSelectedPaper(paper)}
												className={`w-full rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
													isSelected
														? "border-primary bg-primary/5"
														: "bg-card enabled:active:bg-muted"
												}`}
											>
												<div className="flex items-start justify-between gap-2">
													<p className="text-sm font-medium leading-tight">
														{paper.title}
													</p>
													<div className="flex items-center gap-1 shrink-0">
														{isSelected && (
															<CheckCircle2 className="h-4 w-4 text-primary" />
														)}
														{!paper.has_mark_scheme && (
															<span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
																<AlertCircle className="h-3.5 w-3.5" />
																No mark scheme
															</span>
														)}
													</div>
												</div>
												<div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
													<Badge
														variant={subjectColor(paper.subject)}
														className="text-xs"
													>
														{capitalize(paper.subject)}
													</Badge>
													{paper.exam_board && <span>{paper.exam_board}</span>}
													<span>{paper.year}</span>
													<span>{paper.total_marks} marks</span>
												</div>
											</button>
										)
									})}
								</div>
							)}
						</div>

						{gradingError && (
							<p className="text-sm text-destructive">{gradingError}</p>
						)}
					</>
				)}
			</div>

			{/* Sticky bottom CTA */}
			<div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur px-4 py-4 safe-area-inset-bottom">
				<div className="max-w-lg mx-auto">
					{step === "upload" && (
						<Button
							className="w-full h-14 text-base rounded-xl"
							disabled={!readyToProcess}
							onClick={handleTriggerOcr}
						>
							{isUploading ? (
								<>
									<Spinner className="mr-2 h-4 w-4" />
									Uploading…
								</>
							) : (
								"Extract answers"
							)}
						</Button>
					)}

					{step === "select-paper" && (
						<Button
							className="w-full h-14 text-base rounded-xl"
							disabled={!selectedPaper}
							onClick={handleTriggerGrading}
						>
							Mark this paper
						</Button>
					)}
				</div>
			</div>
		</div>
	)
}

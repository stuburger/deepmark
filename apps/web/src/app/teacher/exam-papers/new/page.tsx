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
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { createExamPaperStandalone } from "@/lib/dashboard-actions"
import {
	type DetectedPdfMetadata,
	type IngestionSlot,
	type PdfDocumentType,
	createExamPaperWithMultipleIngestions,
	extractPdfMetadata,
	requestMetadataUpload,
} from "@/lib/pdf-metadata-actions"
import { SUBJECTS, SUBJECT_VALUES, type Subject } from "@/lib/subjects"
import {
	AlertTriangle,
	CheckCircle2,
	FileText,
	Sparkles,
	Upload,
	X,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

// ─── Constants ────────────────────────────────────────────────────────────────

const EXAM_BOARDS = ["AQA", "OCR", "Edexcel", "WJEC", "Cambridge", "Other"]

const DOCUMENT_TYPE_META: Record<
	PdfDocumentType,
	{ label: string; description: string }
> = {
	mark_scheme: {
		label: "Mark scheme",
		description: "Populates questions and mark scheme criteria",
	},
	question_paper: {
		label: "Question paper",
		description: "Populates questions without mark scheme",
	},
	exemplar: {
		label: "Exemplar",
		description: "Adds exemplar student answers",
	},
}

const DOCUMENT_TYPE_ORDER: PdfDocumentType[] = [
	"mark_scheme",
	"question_paper",
	"exemplar",
]

// ─── Types ────────────────────────────────────────────────────────────────────

type DocumentSlot = {
	s3Key: string
	fileName: string
	metadata: DetectedPdfMetadata
}

type SlotState =
	| { kind: "empty" }
	| { kind: "uploading"; fileName: string }
	| { kind: "extracting"; fileName: string; s3Key: string }
	| { kind: "ready"; slot: DocumentSlot }
	| { kind: "error"; fileName: string; message: string }

type Slots = Record<PdfDocumentType, SlotState>

type ProcessingStage =
	| { kind: "uploading"; fileName: string }
	| { kind: "extracting"; fileName: string; s3Key: string }

type Stage =
	| { kind: "idle" }
	| { kind: "processing"; sub: ProcessingStage }
	| { kind: "confirm"; slots: Slots; autoDetected: boolean }
	| { kind: "error"; message: string }

type ValidationWarning = { message: string; severity: "warning" | "error" }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptySlots(): Slots {
	return {
		mark_scheme: { kind: "empty" },
		question_paper: { kind: "empty" },
		exemplar: { kind: "empty" },
	}
}

function readySlots(
	slots: Slots,
): { type: PdfDocumentType; slot: DocumentSlot }[] {
	return DOCUMENT_TYPE_ORDER.flatMap((t) => {
		const s = slots[t]
		return s.kind === "ready" ? [{ type: t, slot: s.slot }] : []
	})
}

function computeWarnings(slots: Slots): ValidationWarning[] {
	const ready = readySlots(slots)
	if (ready.length < 2) return []

	const warnings: ValidationWarning[] = []
	const primary = ready[0]

	for (const { type, slot } of ready.slice(1)) {
		const label = DOCUMENT_TYPE_META[type].label.toLowerCase()

		if (
			slot.metadata.document_type !== type &&
			// Only warn if Gemini strongly disagrees (not just uncertain)
			slot.metadata.document_type !== primary?.slot.metadata.document_type
		) {
			warnings.push({
				message: `The ${label} PDF looks like a ${DOCUMENT_TYPE_META[slot.metadata.document_type].label.toLowerCase()} — check you dropped it on the right card.`,
				severity: "warning",
			})
		}

		if (primary && slot.metadata.subject !== primary.slot.metadata.subject) {
			warnings.push({
				message: `Subject mismatch: the ${label} shows "${slot.metadata.subject}" but the primary document shows "${primary.slot.metadata.subject}".`,
				severity: "error",
			})
		}

		if (
			primary &&
			slot.metadata.exam_board !== primary.slot.metadata.exam_board
		) {
			warnings.push({
				message: `Exam board mismatch: the ${label} shows "${slot.metadata.exam_board}" but the primary document shows "${primary.slot.metadata.exam_board}".`,
				severity: "warning",
			})
		}

		if (
			primary &&
			slot.metadata.year !== null &&
			primary.slot.metadata.year !== null &&
			slot.metadata.year !== primary.slot.metadata.year
		) {
			warnings.push({
				message: `Year mismatch: the ${label} shows ${slot.metadata.year} but the primary document shows ${primary.slot.metadata.year}. Are these from the same exam?`,
				severity: "error",
			})
		}
	}

	return warnings
}

function primaryMetadata(slots: Slots): DetectedPdfMetadata | null {
	// Prefer mark_scheme → question_paper → exemplar as the source of truth
	for (const t of DOCUMENT_TYPE_ORDER) {
		const s = slots[t]
		if (s.kind === "ready") return s.slot.metadata
	}
	return null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewExamPaperPage() {
	const router = useRouter()
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [isDragging, setIsDragging] = useState(false)
	const [stage, setStage] = useState<Stage>({ kind: "idle" })

	// Form state — shared across manual and AI paths
	const [title, setTitle] = useState("")
	const [subject, setSubject] = useState<Subject>("biology")
	const [examBoard, setExamBoard] = useState("AQA")
	const [year, setYear] = useState(String(new Date().getFullYear()))
	const [paperNumber, setPaperNumber] = useState("")
	const [totalMarks, setTotalMarks] = useState("")
	const [durationMinutes, setDurationMinutes] = useState("")
	const [isPublic, setIsPublic] = useState(false)
	const [runAdversarialLoop, setRunAdversarialLoop] = useState(false)
	const [submitting, setSubmitting] = useState(false)
	const [submitError, setSubmitError] = useState<string | null>(null)

	function applyMetadataToForm(metadata: DetectedPdfMetadata) {
		setTitle(metadata.title)
		const validSubject = SUBJECT_VALUES.includes(metadata.subject as Subject)
			? (metadata.subject as Subject)
			: "biology"
		setSubject(validSubject)
		const matchedBoard =
			EXAM_BOARDS.find(
				(b) => b.toLowerCase() === metadata.exam_board.toLowerCase(),
			) ?? "Other"
		setExamBoard(matchedBoard)
		setYear(
			metadata.year ? String(metadata.year) : String(new Date().getFullYear()),
		)
		setPaperNumber(metadata.paper_number ? String(metadata.paper_number) : "")
		setTotalMarks(String(metadata.total_marks))
		setDurationMinutes(String(metadata.duration_minutes))
	}

	function resetForm() {
		setTitle("")
		setSubject("biology")
		setExamBoard("AQA")
		setYear(String(new Date().getFullYear()))
		setPaperNumber("")
		setTotalMarks("")
		setDurationMinutes("")
		setIsPublic(false)
		setRunAdversarialLoop(false)
		setSubmitError(null)
	}

	function startManual() {
		resetForm()
		setStage({
			kind: "confirm",
			slots: emptySlots(),
			autoDetected: false,
		})
	}

	// ── Upload + detect a single file, returns the slot or null on failure ──

	async function uploadAndDetect(
		file: File,
		onProgress: (sub: ProcessingStage) => void,
	): Promise<{ s3Key: string; metadata: DetectedPdfMetadata } | null> {
		onProgress({ kind: "uploading", fileName: file.name })

		const uploadResult = await requestMetadataUpload()
		if (!uploadResult.ok) return null

		try {
			const putRes = await fetch(uploadResult.url, {
				method: "PUT",
				body: file,
				headers: { "Content-Type": "application/pdf" },
			})
			if (!putRes.ok) return null
		} catch {
			return null
		}

		onProgress({
			kind: "extracting",
			fileName: file.name,
			s3Key: uploadResult.s3Key,
		})

		const metadataResult = await extractPdfMetadata(uploadResult.s3Key)
		if (!metadataResult.ok) return null

		return { s3Key: uploadResult.s3Key, metadata: metadataResult.metadata }
	}

	// ── First drop on the idle screen ──

	async function processFirstFile(file: File) {
		if (!file.type.includes("pdf")) {
			setStage({ kind: "error", message: "Please select a PDF file." })
			return
		}

		const result = await uploadAndDetect(file, (sub) =>
			setStage({ kind: "processing", sub }),
		)

		if (!result) {
			setStage({
				kind: "error",
				message: "Upload or detection failed. Please try again.",
			})
			return
		}

		const { s3Key, metadata } = result
		applyMetadataToForm(metadata)

		const slots = emptySlots()
		slots[metadata.document_type] = {
			kind: "ready",
			slot: { s3Key, fileName: file.name, metadata },
		}

		setStage({ kind: "confirm", slots, autoDetected: true })
	}

	// ── Drop on a card inside the confirm stage ──

	async function processCardFile(file: File, cardType: PdfDocumentType) {
		if (!file.type.includes("pdf")) return
		if (stage.kind !== "confirm") return

		// Optimistically update this slot to uploading
		setStage((prev) => {
			if (prev.kind !== "confirm") return prev
			return {
				...prev,
				slots: {
					...prev.slots,
					[cardType]: { kind: "uploading", fileName: file.name },
				},
			}
		})

		const uploadResult = await requestMetadataUpload()
		if (!uploadResult.ok) {
			setStage((prev) => {
				if (prev.kind !== "confirm") return prev
				return {
					...prev,
					slots: {
						...prev.slots,
						[cardType]: {
							kind: "error",
							fileName: file.name,
							message: uploadResult.error,
						},
					},
				}
			})
			return
		}

		try {
			const putRes = await fetch(uploadResult.url, {
				method: "PUT",
				body: file,
				headers: { "Content-Type": "application/pdf" },
			})
			if (!putRes.ok) throw new Error("Upload failed")
		} catch {
			setStage((prev) => {
				if (prev.kind !== "confirm") return prev
				return {
					...prev,
					slots: {
						...prev.slots,
						[cardType]: {
							kind: "error",
							fileName: file.name,
							message: "Upload failed. Please try again.",
						},
					},
				}
			})
			return
		}

		setStage((prev) => {
			if (prev.kind !== "confirm") return prev
			return {
				...prev,
				slots: {
					...prev.slots,
					[cardType]: {
						kind: "extracting",
						fileName: file.name,
						s3Key: uploadResult.s3Key,
					},
				},
			}
		})

		const metadataResult = await extractPdfMetadata(uploadResult.s3Key)

		setStage((prev) => {
			if (prev.kind !== "confirm") return prev
			if (!metadataResult.ok) {
				return {
					...prev,
					slots: {
						...prev.slots,
						[cardType]: {
							kind: "error",
							fileName: file.name,
							message: metadataResult.error,
						},
					},
				}
			}

			const newSlots = {
				...prev.slots,
				[cardType]: {
					kind: "ready" as const,
					slot: {
						s3Key: uploadResult.s3Key,
						fileName: file.name,
						metadata: metadataResult.metadata,
					},
				},
			}

			// If form is not yet populated (no primary doc yet), fill from this one
			const existingPrimary = primaryMetadata(prev.slots)
			if (!existingPrimary) {
				applyMetadataToForm(metadataResult.metadata)
			}

			return { ...prev, slots: newSlots, autoDetected: true }
		})
	}

	// ── Drag handlers for idle zone ──

	function handleIdleDragOver(e: React.DragEvent) {
		e.preventDefault()
		setIsDragging(true)
	}

	function handleIdleDragLeave(e: React.DragEvent) {
		e.preventDefault()
		setIsDragging(false)
	}

	function handleIdleDrop(e: React.DragEvent) {
		e.preventDefault()
		setIsDragging(false)
		const f = e.dataTransfer.files[0]
		if (f) processFirstFile(f)
	}

	// ── Submit ──

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		if (stage.kind !== "confirm") return
		setSubmitError(null)

		if (!title.trim()) {
			setSubmitError("Title is required")
			return
		}
		const parsedYear = Number.parseInt(year, 10)
		if (!year || isNaN(parsedYear)) {
			setSubmitError("Valid year is required")
			return
		}
		const parsedMarks = Number.parseInt(totalMarks, 10)
		if (!totalMarks || isNaN(parsedMarks)) {
			setSubmitError("Total marks is required")
			return
		}
		const parsedDuration = Number.parseInt(durationMinutes, 10)
		if (!durationMinutes || isNaN(parsedDuration)) {
			setSubmitError("Duration is required")
			return
		}

		const ready = readySlots(stage.slots)
		setSubmitting(true)

		if (ready.length > 0) {
			const slots: [IngestionSlot, ...IngestionSlot[]] = [
				{
					s3MetadataKey: ready[0].slot.s3Key,
					document_type: ready[0].type,
					run_adversarial_loop:
						ready[0].type === "mark_scheme" ? runAdversarialLoop : false,
				},
				...ready.slice(1).map(({ type, slot }) => ({
					s3MetadataKey: slot.s3Key,
					document_type: type,
					run_adversarial_loop: false,
				})),
			]

			const result = await createExamPaperWithMultipleIngestions({
				slots,
				title: title.trim(),
				subject,
				exam_board: examBoard,
				year: parsedYear,
				paper_number: paperNumber
					? Number.parseInt(paperNumber, 10)
					: undefined,
				total_marks: parsedMarks,
				duration_minutes: parsedDuration,
				is_public: isPublic,
			})
			setSubmitting(false)
			if (!result.ok) {
				setSubmitError(result.error)
				return
			}
			router.push(`/teacher/exam-papers/${result.paperId}`)
		} else {
			// Manual path — no PDFs uploaded
			const result = await createExamPaperStandalone({
				title: title.trim(),
				subject,
				exam_board: examBoard,
				year: parsedYear,
				paper_number: paperNumber
					? Number.parseInt(paperNumber, 10)
					: undefined,
				total_marks: parsedMarks,
				duration_minutes: parsedDuration,
				is_public: isPublic,
			})
			setSubmitting(false)
			if (!result.ok) {
				setSubmitError(result.error)
				return
			}
			router.push(`/teacher/exam-papers/${result.id}`)
		}
	}

	// ── Render ──

	const warnings = stage.kind === "confirm" ? computeWarnings(stage.slots) : []
	const hasAnyReady =
		stage.kind === "confirm" && readySlots(stage.slots).length > 0
	const markSchemeReady =
		stage.kind === "confirm" && stage.slots.mark_scheme.kind === "ready"

	return (
		<div className="max-w-xl space-y-6">
			<div>
				<Link
					href="/teacher/exam-papers"
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← Back to exam papers
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">New exam paper</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Drop your PDF and we&apos;ll detect the details automatically.
				</p>
			</div>

			{/* ── Idle: single drop zone ─────────────────────────────────── */}
			{stage.kind === "idle" && (
				<Card>
					<CardContent className="pt-6 pb-6">
						<div
							onDragOver={handleIdleDragOver}
							onDragEnter={handleIdleDragOver}
							onDragLeave={handleIdleDragLeave}
							onDrop={handleIdleDrop}
							onClick={() => fileInputRef.current?.click()}
							className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center cursor-pointer transition-colors select-none ${
								isDragging
									? "border-primary bg-primary/5"
									: "border-input hover:border-primary/50 hover:bg-muted/30"
							}`}
						>
							<div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-4">
								<Upload className="h-7 w-7 text-primary" />
							</div>
							<p className="text-sm font-medium">
								Drop your exam paper PDF here
							</p>
							<p className="text-xs text-muted-foreground mt-1">
								or click to browse
							</p>
							<p className="text-xs text-muted-foreground mt-4 max-w-xs leading-relaxed">
								Subject, board, year, marks, duration and document type will be
								detected automatically
							</p>
						</div>
						<input
							ref={fileInputRef}
							type="file"
							accept=".pdf,application/pdf"
							className="sr-only"
							onChange={(e) => {
								const f = e.target.files?.[0]
								if (f) processFirstFile(f)
							}}
						/>
						<p className="mt-4 text-center text-sm text-muted-foreground">
							Creating a new paper from scratch?{" "}
							<button
								type="button"
								onClick={startManual}
								className="underline underline-offset-4 hover:text-foreground"
							>
								Fill in manually
							</button>
						</p>
					</CardContent>
				</Card>
			)}

			{/* ── Processing: first upload + extraction ─────────────────── */}
			{stage.kind === "processing" && (
				<Card>
					<CardContent className="pt-6 pb-6">
						<div className="flex flex-col items-center justify-center py-8 gap-5">
							<div
								className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
									stage.sub.kind === "extracting" ? "bg-primary/10" : "bg-muted"
								}`}
							>
								{stage.sub.kind === "extracting" ? (
									<Sparkles className="h-7 w-7 text-primary" />
								) : (
									<FileText className="h-7 w-7 text-muted-foreground" />
								)}
							</div>
							<div className="text-center space-y-1.5">
								<p className="text-sm font-medium">{stage.sub.fileName}</p>
								<div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
									<Spinner className="h-4 w-4 shrink-0" />
									<span>
										{stage.sub.kind === "uploading"
											? "Uploading…"
											: "Detecting paper details…"}
									</span>
								</div>
								{stage.sub.kind === "extracting" && (
									<p className="text-xs text-muted-foreground">
										Gemini is reading the cover page and header
									</p>
								)}
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* ── Error ─────────────────────────────────────────────────── */}
			{stage.kind === "error" && (
				<Card>
					<CardContent className="pt-6 pb-6 space-y-4">
						<p className="text-sm text-destructive">{stage.message}</p>
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									resetForm()
									setStage({ kind: "idle" })
								}}
							>
								Try again
							</Button>
							<Button variant="ghost" size="sm" onClick={startManual}>
								Fill in manually instead
							</Button>
						</div>
					</CardContent>
				</Card>
			)}

			{/* ── Confirm ───────────────────────────────────────────────── */}
			{stage.kind === "confirm" && (
				<>
					{/* Paper details form */}
					<Card>
						<CardHeader>
							<div className="flex items-start justify-between gap-2">
								<div>
									<CardTitle>Paper details</CardTitle>
									<CardDescription className="mt-1">
										{stage.autoDetected
											? "Review the details we detected from your PDF, then confirm."
											: "Fill in the metadata for this exam paper."}
									</CardDescription>
								</div>
								{stage.autoDetected && (
									<Badge variant="secondary" className="shrink-0 gap-1 text-xs">
										<Sparkles className="h-3 w-3" />
										AI detected
									</Badge>
								)}
							</div>
						</CardHeader>
						<CardContent>
							<form
								id="new-paper-form"
								onSubmit={handleSubmit}
								className="space-y-4"
							>
								<div className="space-y-2">
									<Label htmlFor="title">Title</Label>
									<Input
										id="title"
										value={title}
										onChange={(e) => setTitle(e.target.value)}
										placeholder="e.g. AQA Biology Paper 1 Higher"
									/>
								</div>

								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="subject">Subject</Label>
										<select
											id="subject"
											className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
											value={subject}
											onChange={(e) => setSubject(e.target.value as Subject)}
										>
											{SUBJECTS.map((s) => (
												<option key={s.value} value={s.value}>
													{s.label}
												</option>
											))}
										</select>
									</div>
									<div className="space-y-2">
										<Label htmlFor="board">Exam board</Label>
										<select
											id="board"
											className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
											value={examBoard}
											onChange={(e) => setExamBoard(e.target.value)}
										>
											{EXAM_BOARDS.map((b) => (
												<option key={b} value={b}>
													{b}
												</option>
											))}
										</select>
									</div>
								</div>

								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="year">Year</Label>
										<Input
											id="year"
											type="number"
											value={year}
											onChange={(e) => setYear(e.target.value)}
											placeholder="e.g. 2024"
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="paper-number">
											Paper number (optional)
										</Label>
										<Input
											id="paper-number"
											type="number"
											value={paperNumber}
											onChange={(e) => setPaperNumber(e.target.value)}
											placeholder="e.g. 1"
										/>
									</div>
								</div>

								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="marks">Total marks</Label>
										<Input
											id="marks"
											type="number"
											value={totalMarks}
											onChange={(e) => setTotalMarks(e.target.value)}
											placeholder="e.g. 100"
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="duration">Duration (minutes)</Label>
										<Input
											id="duration"
											type="number"
											value={durationMinutes}
											onChange={(e) => setDurationMinutes(e.target.value)}
											placeholder="e.g. 60"
										/>
									</div>
								</div>
							</form>
						</CardContent>
					</Card>

					{/* Document cards */}
					<Card>
						<CardHeader>
							<CardTitle>Documents</CardTitle>
							<CardDescription>
								You can add more documents now or upload them later from the
								paper page.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							{DOCUMENT_TYPE_ORDER.map((docType) => (
								<DocumentCard
									key={docType}
									docType={docType}
									slotState={stage.slots[docType]}
									onFile={(f) => processCardFile(f, docType)}
									onClear={() =>
										setStage((prev) => {
											if (prev.kind !== "confirm") return prev
											return {
												...prev,
												slots: {
													...prev.slots,
													[docType]: { kind: "empty" },
												},
											}
										})
									}
								/>
							))}
						</CardContent>
					</Card>

					{/* Validation warnings */}
					{warnings.length > 0 && (
						<div className="space-y-2">
							{warnings.map((w, i) => (
								<div
									key={i}
									className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${
										w.severity === "error"
											? "border-destructive/40 bg-destructive/5 text-destructive"
											: "border-amber-400/40 bg-amber-500/5 text-amber-800 dark:text-amber-200"
									}`}
								>
									<AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
									<span>{w.message}</span>
								</div>
							))}
						</div>
					)}

					{/* Adversarial loop — mark scheme only */}
					{markSchemeReady && (
						<div className="flex items-center justify-between rounded-lg border p-3">
							<div>
								<p className="text-sm font-medium">
									Run adversarial quality check
								</p>
								<p className="text-xs text-muted-foreground">
									Tests mark scheme with synthetic answers at different score
									levels. Adds 5–20 minutes and incurs extra cost.
								</p>
							</div>
							<Switch
								checked={runAdversarialLoop}
								onCheckedChange={setRunAdversarialLoop}
							/>
						</div>
					)}

					{/* Publish toggle */}
					<div className="flex items-center justify-between rounded-lg border p-3">
						<div>
							<p className="text-sm font-medium">Publish to catalog</p>
							<p className="text-xs text-muted-foreground">
								Teachers can browse and select this paper for marking sessions.
							</p>
						</div>
						<Switch checked={isPublic} onCheckedChange={setIsPublic} />
					</div>

					{submitError && (
						<p className="text-sm text-destructive">{submitError}</p>
					)}

					<div className="flex gap-2">
						<Button type="submit" form="new-paper-form" disabled={submitting}>
							{submitting
								? "Creating…"
								: hasAnyReady
									? "Create & process"
									: "Create exam paper"}
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={submitting}
							onClick={() => {
								resetForm()
								setStage({ kind: "idle" })
							}}
						>
							{hasAnyReady ? "Start over" : "Cancel"}
						</Button>
					</div>
				</>
			)}
		</div>
	)
}

// ─── DocumentCard ─────────────────────────────────────────────────────────────

function DocumentCard({
	docType,
	slotState,
	onFile,
	onClear,
}: {
	docType: PdfDocumentType
	slotState: SlotState
	onFile: (file: File) => void
	onClear: () => void
}) {
	const [isDragging, setIsDragging] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)
	const meta = DOCUMENT_TYPE_META[docType]

	const isActive = slotState.kind !== "empty"
	const isBusy =
		slotState.kind === "uploading" || slotState.kind === "extracting"

	function handleDragOver(e: React.DragEvent) {
		e.preventDefault()
		if (!isBusy) setIsDragging(true)
	}

	function handleDragLeave(e: React.DragEvent) {
		e.preventDefault()
		setIsDragging(false)
	}

	function handleDrop(e: React.DragEvent) {
		e.preventDefault()
		setIsDragging(false)
		if (isBusy) return
		const f = e.dataTransfer.files[0]
		if (f?.type.includes("pdf")) onFile(f)
	}

	return (
		<div
			className={`relative rounded-lg border transition-colors ${
				slotState.kind === "ready"
					? "border-green-500/40 bg-green-500/5"
					: slotState.kind === "error"
						? "border-destructive/40 bg-destructive/5"
						: isDragging
							? "border-primary bg-primary/5"
							: isActive
								? "border-primary/30 bg-primary/5"
								: "border-dashed border-input hover:border-primary/50 hover:bg-muted/30"
			}`}
		>
			<div className="flex items-center gap-3 p-3">
				{/* Status icon */}
				<div
					className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
						slotState.kind === "ready"
							? "bg-green-500/10"
							: slotState.kind === "error"
								? "bg-destructive/10"
								: isBusy
									? "bg-primary/10"
									: "bg-muted"
					}`}
				>
					{slotState.kind === "ready" ? (
						<CheckCircle2 className="h-4 w-4 text-green-600" />
					) : slotState.kind === "error" ? (
						<X className="h-4 w-4 text-destructive" />
					) : isBusy ? (
						<Spinner className="h-4 w-4" />
					) : (
						<Upload className="h-4 w-4 text-muted-foreground" />
					)}
				</div>

				{/* Label + filename */}
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium">{meta.label}</p>
					{slotState.kind === "empty" && (
						<p className="text-xs text-muted-foreground">{meta.description}</p>
					)}
					{slotState.kind === "uploading" && (
						<p className="text-xs text-muted-foreground truncate">
							Uploading {slotState.fileName}…
						</p>
					)}
					{slotState.kind === "extracting" && (
						<p className="text-xs text-muted-foreground truncate">
							Detecting details…
						</p>
					)}
					{slotState.kind === "ready" && (
						<p className="text-xs text-muted-foreground truncate">
							{slotState.slot.fileName}
						</p>
					)}
					{slotState.kind === "error" && (
						<p className="text-xs text-destructive truncate">
							{slotState.message}
						</p>
					)}
				</div>

				{/* Right-side action */}
				{slotState.kind === "empty" || slotState.kind === "error" ? (
					<div
						role="button"
						tabIndex={0}
						onDragOver={handleDragOver}
						onDragEnter={handleDragOver}
						onDragLeave={handleDragLeave}
						onDrop={handleDrop}
						onClick={() => inputRef.current?.click()}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
						}}
						className="cursor-pointer rounded-md border border-dashed px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors select-none"
					>
						{slotState.kind === "error" ? "Retry" : "Drop or browse"}
					</div>
				) : slotState.kind === "ready" ? (
					<button
						type="button"
						onClick={onClear}
						className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
						aria-label={`Remove ${meta.label}`}
					>
						<X className="h-4 w-4" />
					</button>
				) : null}
			</div>

			<input
				ref={inputRef}
				type="file"
				accept=".pdf,application/pdf"
				className="sr-only"
				onChange={(e) => {
					const f = e.target.files?.[0]
					if (f) onFile(f)
					// Reset so the same file can be re-selected after clearing it
					e.target.value = ""
				}}
			/>
		</div>
	)
}

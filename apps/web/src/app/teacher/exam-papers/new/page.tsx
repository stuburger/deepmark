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
import { Switch } from "@/components/ui/switch"
import { createExamPaperStandalone } from "@/lib/exam-paper/paper/mutations"
import {
	type DetectedPdfMetadata,
	type IngestionSlot,
	type PdfDocumentType,
	createExamPaperWithMultipleIngestions,
	extractPdfMetadata,
	requestMetadataUpload,
} from "@/lib/pdf-ingestion/metadata"
import {
	EXAM_BOARDS,
	SUBJECTS,
	SUBJECT_VALUES,
	type Subject,
} from "@/lib/subjects"
import { validatePdfFile } from "@/lib/upload-validation"
import { Sparkles } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { IdleDropZone } from "./idle-drop-zone"
import { ProcessingCard, type ProcessingStage } from "./processing-card"

// ─── Types ────────────────────────────────────────────────────────────────────

type DocumentSlot = {
	s3Key: string
	fileName: string
	metadata: DetectedPdfMetadata
}

type Stage =
	| { kind: "idle" }
	| { kind: "processing"; sub: ProcessingStage }
	| {
			kind: "confirm"
			/** At most one PDF for metadata + ingestion; further docs are added on the paper page */
			pendingIngestion: {
				slot: DocumentSlot
				documentType: PdfDocumentType
			} | null
			autoDetected: boolean
	  }
	| { kind: "error"; message: string }

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewExamPaperPage() {
	const router = useRouter()
	const [stage, setStage] = useState<Stage>({ kind: "idle" })

	// Form state — shared across manual and AI paths
	const [title, setTitle] = useState("")
	const [subject, setSubject] = useState<Subject>("biology")
	const [examBoard, setExamBoard] = useState("AQA")
	const [year, setYear] = useState(String(new Date().getFullYear()))
	const [paperNumber, setPaperNumber] = useState("")
	const [totalMarks, setTotalMarks] = useState("")
	const [durationMinutes, setDurationMinutes] = useState("")
	const [isPublic, setIsPublic] = useState(true)
	const [detectedTier, setDetectedTier] = useState<
		"foundation" | "higher" | null
	>(null)
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
		setDetectedTier(metadata.tier)
	}

	function resetForm() {
		setTitle("")
		setSubject("biology")
		setExamBoard("AQA")
		setYear(String(new Date().getFullYear()))
		setPaperNumber("")
		setTotalMarks("")
		setDurationMinutes("")
		setIsPublic(true)
		setDetectedTier(null)
		setSubmitError(null)
	}

	function startManual() {
		resetForm()
		setStage({
			kind: "confirm",
			pendingIngestion: null,
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
		const validation = validatePdfFile(file)
		if (!validation.ok) {
			setStage({ kind: "error", message: validation.error })
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

		setStage({
			kind: "confirm",
			pendingIngestion: {
				slot: { s3Key, fileName: file.name, metadata },
				documentType: metadata.document_type,
			},
			autoDetected: true,
		})
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
		if (!year || Number.isNaN(parsedYear)) {
			setSubmitError("Valid year is required")
			return
		}
		const parsedMarks = Number.parseInt(totalMarks, 10)
		if (!totalMarks || Number.isNaN(parsedMarks)) {
			setSubmitError("Total marks is required")
			return
		}
		const parsedDuration = Number.parseInt(durationMinutes, 10)
		if (!durationMinutes || Number.isNaN(parsedDuration)) {
			setSubmitError("Duration is required")
			return
		}

		const pending = stage.pendingIngestion
		setSubmitting(true)

		if (pending) {
			const slots: [IngestionSlot, ...IngestionSlot[]] = [
				{
					s3MetadataKey: pending.slot.s3Key,
					document_type: pending.documentType,
					run_adversarial_loop: false,
				},
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
				tier: detectedTier,
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

	const hasPendingIngestion =
		stage.kind === "confirm" && stage.pendingIngestion !== null

	return (
		<div className="max-w-xl space-y-6 pt-6">
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
				<IdleDropZone
					onFileSelected={processFirstFile}
					onManual={startManual}
				/>
			)}

			{/* ── Processing: first upload + extraction ─────────────────── */}
			{stage.kind === "processing" && <ProcessingCard sub={stage.sub} />}

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
								: hasPendingIngestion
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
							{hasPendingIngestion ? "Start over" : "Cancel"}
						</Button>
					</div>
				</>
			)}
		</div>
	)
}

"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { IdleDropZone } from "./idle-drop-zone"
import { ProcessingCard, type ProcessingStage } from "./processing-card"

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
			pendingIngestion: {
				slot: DocumentSlot
				documentType: PdfDocumentType
			} | null
			autoDetected: boolean
	  }
	| { kind: "error"; message: string }

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function NewExamPaperDialog({ open, onOpenChange }: Props) {
	const router = useRouter()
	const [stage, setStage] = useState<Stage>({ kind: "idle" })

	const [title, setTitle] = useState("")
	const [subject, setSubject] = useState<Subject>("biology")
	const [examBoard, setExamBoard] = useState("AQA")
	const [year, setYear] = useState(String(new Date().getFullYear()))
	const [paperNumber, setPaperNumber] = useState("")
	const [totalMarks, setTotalMarks] = useState("")
	const [durationMinutes, setDurationMinutes] = useState("")
	const [detectedTier, setDetectedTier] = useState<
		"foundation" | "higher" | null
	>(null)
	const [submitting, setSubmitting] = useState(false)

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
		setDetectedTier(null)
	}

	function handleOpenChange(next: boolean) {
		if (!next) {
			resetForm()
			setStage({ kind: "idle" })
		}
		onOpenChange(next)
	}

	function startManual() {
		resetForm()
		setStage({
			kind: "confirm",
			pendingIngestion: null,
			autoDetected: false,
		})
	}

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

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		if (stage.kind !== "confirm") return

		if (!title.trim()) {
			toast.error("Title is required")
			return
		}
		const parsedYear = Number.parseInt(year, 10)
		if (!year || Number.isNaN(parsedYear)) {
			toast.error("Valid year is required")
			return
		}
		const parsedMarks = Number.parseInt(totalMarks, 10)
		if (!totalMarks || Number.isNaN(parsedMarks)) {
			toast.error("Total marks is required")
			return
		}
		const parsedDuration = Number.parseInt(durationMinutes, 10)
		if (!durationMinutes || Number.isNaN(parsedDuration)) {
			toast.error("Duration is required")
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
				tier: detectedTier,
			})
			setSubmitting(false)
			if (!result.ok) {
				toast.error(result.error)
				return
			}
			router.push(`/teacher/exam-papers/${result.paperId}`)
		} else {
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
			})
			setSubmitting(false)
			if (!result.ok) {
				toast.error(result.error)
				return
			}
			router.push(`/teacher/exam-papers/${result.id}`)
		}
	}

	const hasPendingIngestion =
		stage.kind === "confirm" && stage.pendingIngestion !== null

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>New exam paper</DialogTitle>
					<DialogDescription>
						{stage.kind === "confirm" && stage.autoDetected
							? "Review the details we detected, then confirm."
							: stage.kind === "confirm"
								? "Fill in the metadata for this exam paper."
								: "Drop your PDF and we'll detect the details automatically."}
					</DialogDescription>
				</DialogHeader>

				{stage.kind === "idle" && (
					<IdleDropZone
						onFileSelected={processFirstFile}
						onManual={startManual}
					/>
				)}

				{stage.kind === "processing" && <ProcessingCard sub={stage.sub} />}

				{stage.kind === "error" && (
					<div className="space-y-4">
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
					</div>
				)}

				{stage.kind === "confirm" && (
					<div className="space-y-4">
						{stage.autoDetected && (
							<div>
								<Badge variant="secondary" className="gap-1 text-xs">
									<Sparkles className="h-3 w-3" />
									AI detected
								</Badge>
							</div>
						)}

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
									<Label htmlFor="paper-number">Paper number (optional)</Label>
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

						<div className="flex gap-2 justify-end">
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
							<Button type="submit" form="new-paper-form" disabled={submitting}>
								{submitting
									? "Creating…"
									: hasPendingIngestion
										? "Confirm & process"
										: "Create exam paper"}
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}

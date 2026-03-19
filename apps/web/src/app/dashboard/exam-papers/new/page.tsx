"use client"

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
import {
	type CreateExamPaperInput,
	createExamPaperStandalone,
} from "@/lib/dashboard-actions"
import { SUBJECTS, type Subject } from "@/lib/subjects"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

const EXAM_BOARDS = ["AQA", "OCR", "Edexcel", "WJEC", "Cambridge", "Other"]

export default function NewExamPaperPage() {
	const router = useRouter()
	const [title, setTitle] = useState("")
	const [subject, setSubject] = useState<Subject>("biology")
	const [examBoard, setExamBoard] = useState("AQA")
	const [year, setYear] = useState(String(new Date().getFullYear()))
	const [paperNumber, setPaperNumber] = useState("")
	const [totalMarks, setTotalMarks] = useState("")
	const [durationMinutes, setDurationMinutes] = useState("")
	const [isPublic, setIsPublic] = useState(false)
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		if (!title.trim()) {
			setError("Title is required")
			return
		}
		if (!year || isNaN(Number.parseInt(year, 10))) {
			setError("Valid year is required")
			return
		}
		if (!totalMarks || isNaN(Number.parseInt(totalMarks, 10))) {
			setError("Total marks is required")
			return
		}
		if (!durationMinutes || isNaN(Number.parseInt(durationMinutes, 10))) {
			setError("Duration is required")
			return
		}

		setSubmitting(true)
		setError(null)
		const input: CreateExamPaperInput = {
			title: title.trim(),
			subject,
			exam_board: examBoard,
			year: Number.parseInt(year, 10),
			paper_number: paperNumber ? Number.parseInt(paperNumber, 10) : undefined,
			total_marks: Number.parseInt(totalMarks, 10),
			duration_minutes: Number.parseInt(durationMinutes, 10),
			is_public: isPublic,
		}
		const result = await createExamPaperStandalone(input)
		setSubmitting(false)
		if (!result.ok) {
			setError(result.error)
			return
		}
		router.push(`/teacher/exam-papers/${result.id}`)
	}

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
					Create an exam paper record. You can upload PDFs to populate its
					questions and mark scheme afterwards.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Paper details</CardTitle>
					<CardDescription>
						Fill in the metadata for this exam paper.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
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

						<div className="flex items-center justify-between rounded-lg border p-3">
							<div>
								<p className="text-sm font-medium">Publish to catalog</p>
								<p className="text-xs text-muted-foreground">
									Teachers can browse and select this paper for marking
									sessions.
								</p>
							</div>
							<Switch checked={isPublic} onCheckedChange={setIsPublic} />
						</div>

						{error && <p className="text-sm text-destructive">{error}</p>}

						<div className="flex gap-2">
							<Button type="submit" disabled={submitting}>
								{submitting ? "Creating…" : "Create exam paper"}
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() => router.back()}
							>
								Cancel
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	)
}

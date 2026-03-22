"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
	type ExtractedAnswer,
	getStudentPaperJob,
	linkStudentToJob,
} from "@/lib/mark-actions"
import {
	type StudentItem,
	createStudent,
	listStudents,
} from "@/lib/student-actions"
import {
	CheckCircle2,
	Loader2,
	Search,
	UserCheck,
	UserPlus,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ContinueMarkingClient } from "./continue-marking-client"

function FastPathGradingPoll({ jobId }: { jobId: string }) {
	const router = useRouter()
	const [pollStatus, setPollStatus] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		let cancelled = false
		const intervalRef: { id: ReturnType<typeof setInterval> | null } = {
			id: null,
		}

		async function tick() {
			const result = await getStudentPaperJob(jobId)
			if (!result.ok || cancelled) return
			const { status } = result.data
			setPollStatus(status)
			if (status === "failed") {
				setError(result.data.error ?? "Marking failed")
			}
			if (status !== "text_extracted") {
				router.refresh()
				if (intervalRef.id) clearInterval(intervalRef.id)
			}
		}

		void tick()
		intervalRef.id = setInterval(tick, 3000)
		return () => {
			cancelled = true
			if (intervalRef.id) clearInterval(intervalRef.id)
		}
	}, [jobId, router])

	return (
		<div className="flex flex-col items-center justify-center min-h-[40vh] gap-5 text-center px-4">
			<Loader2 className="h-10 w-10 text-primary animate-spin shrink-0" />
			<div>
				<p className="text-lg font-semibold">Marking answers…</p>
				<p className="text-sm text-muted-foreground mt-1">
					Grading against the paper you selected. Usually 20–60 seconds.
				</p>
				{pollStatus && (
					<p className="text-xs text-muted-foreground mt-2 tabular-nums">
						Status: {pollStatus}
					</p>
				)}
			</div>
			{error && <p className="text-sm text-destructive max-w-md">{error}</p>}
		</div>
	)
}

export function TextExtractedFlowClient({
	jobId,
	studentLinked,
	detectedStudentName,
	examPaperPreselected,
	extractedAnswers,
	detectedSubject,
}: {
	jobId: string
	studentLinked: boolean
	detectedStudentName: string | null
	examPaperPreselected: boolean
	extractedAnswers: ExtractedAnswer[]
	detectedSubject: string | null
}) {
	const router = useRouter()
	const [skippedStudent, setSkippedStudent] = useState(false)
	const [studentMode, setStudentMode] = useState<"select" | "create">("select")
	const [studentSearch, setStudentSearch] = useState("")
	const [existingStudents, setExistingStudents] = useState<StudentItem[]>([])
	const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
		null,
	)
	const [newStudentName, setNewStudentName] = useState(
		detectedStudentName ?? "",
	)
	const [studentError, setStudentError] = useState<string | null>(null)
	const [confirmingStudent, setConfirmingStudent] = useState(false)

	const showStudentStep = !studentLinked && !skippedStudent
	const studentResolved = studentLinked || skippedStudent

	useEffect(() => {
		if (!showStudentStep) return
		void listStudents().then((r) => {
			if (r.ok) setExistingStudents(r.students)
		})
	}, [showStudentStep])

	async function handleConfirmStudent() {
		setStudentError(null)
		if (studentMode === "select" && !selectedStudentId) {
			setStudentError("Please select a student")
			return
		}
		setConfirmingStudent(true)
		try {
			if (studentMode === "create") {
				if (!newStudentName.trim()) {
					setStudentError("Please enter a student name")
					return
				}
				const createResult = await createStudent(newStudentName.trim())
				if (!createResult.ok) {
					setStudentError(createResult.error)
					return
				}
				const linkResult = await linkStudentToJob(
					jobId,
					createResult.student.id,
				)
				if (!linkResult.ok) {
					setStudentError(linkResult.error)
					return
				}
			} else if (studentMode === "select" && selectedStudentId) {
				const linkResult = await linkStudentToJob(jobId, selectedStudentId)
				if (!linkResult.ok) {
					setStudentError(linkResult.error)
					return
				}
			}
			router.refresh()
		} finally {
			setConfirmingStudent(false)
		}
	}

	function handleSkipStudent() {
		setSkippedStudent(true)
	}

	if (showStudentStep) {
		const filteredStudents = existingStudents.filter((s) =>
			s.name.toLowerCase().includes(studentSearch.toLowerCase()),
		)

		return (
			<div className="space-y-6 max-w-lg">
				<div>
					<h2 className="text-xl font-semibold">Who is this paper for?</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Match to an existing student or create a new record.
					</p>
				</div>

				{detectedStudentName && (
					<div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3">
						<CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
						<div className="flex-1 min-w-0">
							<p className="text-xs text-muted-foreground">Detected on paper</p>
							<p className="text-sm font-medium">{detectedStudentName}</p>
						</div>
					</div>
				)}

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
					<Input
						placeholder="Student full name"
						value={newStudentName}
						onChange={(e) => setNewStudentName(e.target.value)}
					/>
				)}

				{studentError && (
					<p className="text-sm text-destructive">{studentError}</p>
				)}

				<div className="flex flex-col gap-2">
					<Button
						size="lg"
						className="w-full"
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
						onClick={handleSkipStudent}
						className="w-full text-center text-sm text-muted-foreground py-1"
					>
						Skip for now
					</button>
				</div>
			</div>
		)
	}

	if (studentResolved && examPaperPreselected) {
		return <FastPathGradingPoll jobId={jobId} />
	}

	return (
		<ContinueMarkingClient
			jobId={jobId}
			extractedAnswers={extractedAnswers}
			studentName={detectedStudentName}
			detectedSubject={detectedSubject}
		/>
	)
}

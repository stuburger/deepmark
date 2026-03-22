"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { linkStudentToJob } from "@/lib/mark-actions"
import {
	type StudentItem,
	createStudent,
	listStudents,
} from "@/lib/student-actions"
import { CheckCircle2, Search, UserCheck, UserPlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

/**
 * Step 1 of the paper setup wizard.
 * Lets the teacher link an existing student or create a new one,
 * then calls router.refresh() so the parent re-derives the phase.
 */
export function StudentLinker({
	jobId,
	detectedStudentName,
	onSkip,
}: {
	jobId: string
	detectedStudentName: string | null
	/** Called when the teacher skips student linking entirely. */
	onSkip: () => void
}) {
	const router = useRouter()
	const [mode, setMode] = useState<"select" | "create">("select")
	const [search, setSearch] = useState("")
	const [students, setStudents] = useState<StudentItem[]>([])
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [newName, setNewName] = useState(detectedStudentName ?? "")
	const [error, setError] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		void listStudents().then((r) => {
			if (r.ok) setStudents(r.students)
		})
	}, [])

	const filtered = students.filter((s) =>
		s.name.toLowerCase().includes(search.toLowerCase()),
	)

	async function handleConfirm() {
		setError(null)

		if (mode === "select" && !selectedId) {
			setError("Please select a student")
			return
		}
		if (mode === "create" && !newName.trim()) {
			setError("Please enter a student name")
			return
		}

		setSaving(true)
		try {
			if (mode === "create") {
				const created = await createStudent(newName.trim())
				if (!created.ok) {
					setError(created.error)
					return
				}
				const linked = await linkStudentToJob(jobId, created.student.id)
				if (!linked.ok) {
					setError(linked.error)
					return
				}
			} else if (selectedId) {
				const linked = await linkStudentToJob(jobId, selectedId)
				if (!linked.ok) {
					setError(linked.error)
					return
				}
			}
			router.refresh()
		} finally {
			setSaving(false)
		}
	}

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

			{/* Mode toggle */}
			<div className="flex rounded-xl border overflow-hidden">
				<button
					type="button"
					onClick={() => setMode("select")}
					className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
						mode === "select"
							? "bg-primary text-primary-foreground"
							: "bg-background text-muted-foreground hover:bg-muted"
					}`}
				>
					<UserCheck className="h-4 w-4" />
					Existing student
				</button>
				<button
					type="button"
					onClick={() => setMode("create")}
					className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
						mode === "create"
							? "bg-primary text-primary-foreground"
							: "bg-background text-muted-foreground hover:bg-muted"
					}`}
				>
					<UserPlus className="h-4 w-4" />
					New student
				</button>
			</div>

			{mode === "select" && (
				<div className="space-y-3">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							className="pl-9"
							placeholder="Search students…"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
					</div>
					{filtered.length === 0 ? (
						<p className="text-sm text-muted-foreground text-center py-4">
							{students.length === 0
								? "No students yet — create one above."
								: "No students match your search."}
						</p>
					) : (
						<div className="space-y-2 max-h-72 overflow-y-auto">
							{filtered.map((s) => (
								<button
									key={s.id}
									type="button"
									onClick={() => setSelectedId(s.id)}
									className={`w-full rounded-xl border p-3.5 text-left transition-colors ${
										selectedId === s.id
											? "border-primary bg-primary/5"
											: "bg-card active:bg-muted"
									}`}
								>
									<div className="flex items-center justify-between gap-2">
										<p className="text-sm font-medium">{s.name}</p>
										{selectedId === s.id && (
											<CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
										)}
									</div>
									{(s.class_name || s.year_group) && (
										<p className="text-xs text-muted-foreground mt-0.5">
											{[s.class_name, s.year_group].filter(Boolean).join(" · ")}
										</p>
									)}
								</button>
							))}
						</div>
					)}
				</div>
			)}

			{mode === "create" && (
				<Input
					placeholder="Student full name"
					value={newName}
					onChange={(e) => setNewName(e.target.value)}
				/>
			)}

			{error && <p className="text-sm text-destructive">{error}</p>}

			<div className="flex flex-col gap-2">
				<Button
					size="lg"
					className="w-full"
					disabled={
						saving ||
						(mode === "select" && !selectedId) ||
						(mode === "create" && !newName.trim())
					}
					onClick={handleConfirm}
				>
					{saving ? (
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
					onClick={onSkip}
					className="w-full text-center text-sm text-muted-foreground py-1"
				>
					Skip for now
				</button>
			</div>
		</div>
	)
}

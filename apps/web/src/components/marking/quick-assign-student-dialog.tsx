"use client"

import {
	EMPTY_STUDENT,
	StudentForm,
	type StudentFormValues,
} from "@/components/students/student-form"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	linkStudentToJob,
	unlinkStudentFromJob,
} from "@/lib/marking/submissions/mutations"
import { queryKeys } from "@/lib/query-keys"
import { createStudent } from "@/lib/students/mutations"
import { getNextStudentNumber, listStudents } from "@/lib/students/queries"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, UserPlus } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	jobId: string
	detectedNumber: string | null
	/** When set, the dialog runs in re-link mode: the dropdown pre-selects this
	 *  student, an Unlink button appears, and copy/title shifts to "change". */
	currentStudentId?: string | null
	/** Called after a successful link/create-and-link/unlink so the parent can
	 *  invalidate its own list query or refresh the route. */
	onLinked?: () => void
}

type Mode = "select" | "create"

export function QuickAssignStudentDialog({
	open,
	onOpenChange,
	jobId,
	detectedNumber,
	currentStudentId = null,
	onLinked,
}: Props) {
	const queryClient = useQueryClient()
	const isRelink = currentStudentId !== null
	const [mode, setMode] = useState<Mode>("select")
	const [selectedId, setSelectedId] = useState<string | null>(currentStudentId)

	// Re-sync the dropdown when the dialog opens against a different submission.
	useEffect(() => {
		if (open) setSelectedId(currentStudentId)
	}, [open, currentStudentId])

	const { data: students = [], isLoading: studentsLoading } = useQuery({
		queryKey: queryKeys.students(),
		queryFn: async () => {
			const r = await listStudents()
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data?.students ?? []
		},
		enabled: open,
	})

	const { data: nextNumber } = useQuery({
		queryKey: queryKeys.nextStudentNumber(),
		queryFn: async () => {
			const r = await getNextStudentNumber()
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data?.student_number ?? "S-001"
		},
		enabled: open && mode === "create" && !detectedNumber,
	})

	// Empty roster → jump straight into create mode the first time the dialog
	// opens, so the teacher isn't faced with an empty dropdown. Once they've
	// added someone, "select" is the right default again.
	useEffect(() => {
		if (open && !studentsLoading && students.length === 0) {
			setMode("create")
		}
	}, [open, studentsLoading, students.length])

	function invalidateAfterLink() {
		queryClient.invalidateQueries({ queryKey: queryKeys.studentJob(jobId) })
		queryClient.invalidateQueries({ queryKey: queryKeys.students() })
		queryClient.invalidateQueries({
			queryKey: queryKeys.nextStudentNumber(),
		})
		onLinked?.()
	}

	const linkMutation = useMutation({
		mutationFn: async (studentId: string) => {
			const r = await linkStudentToJob({ jobId, studentId })
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data
		},
		onSuccess: () => {
			toast.success(isRelink ? "Student updated" : "Student linked")
			invalidateAfterLink()
			handleOpenChange(false)
		},
		onError: (err) => toast.error(err.message),
	})

	const unlinkMutation = useMutation({
		mutationFn: async () => {
			const r = await unlinkStudentFromJob({ jobId })
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data
		},
		onSuccess: () => {
			toast.success("Student unlinked")
			invalidateAfterLink()
			handleOpenChange(false)
		},
		onError: (err) => toast.error(err.message),
	})

	const createAndLinkMutation = useMutation({
		mutationFn: async (values: StudentFormValues) => {
			const create = await createStudent({
				name: values.name,
				student_number: values.student_number,
				class_name: values.class_name || null,
				year_group: values.year_group || null,
			})
			if (create?.serverError) throw new Error(create.serverError)
			if (!create?.data) throw new Error("Failed to create student")

			const link = await linkStudentToJob({
				jobId,
				studentId: create.data.id,
			})
			if (link?.serverError) throw new Error(link.serverError)

			return create.data
		},
		onSuccess: () => {
			toast.success("Student added and linked")
			invalidateAfterLink()
			handleOpenChange(false)
		},
		onError: (err) => toast.error(err.message),
	})

	function handleOpenChange(next: boolean) {
		if (!next) {
			setSelectedId(currentStudentId)
			setMode("select")
		}
		onOpenChange(next)
	}

	const initialFormValue: StudentFormValues = {
		...EMPTY_STUDENT,
		student_number: detectedNumber ?? nextNumber ?? "",
	}

	const isPending =
		linkMutation.isPending ||
		createAndLinkMutation.isPending ||
		unlinkMutation.isPending

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{mode === "create"
							? "Add and link a student"
							: isRelink
								? "Change linked student"
								: "Link to a student"}
					</DialogTitle>
					<DialogDescription>
						{isRelink && mode === "select" ? (
							"Pick a different student, or unlink to leave this script unattributed."
						) : detectedNumber ? (
							<>
								The OCR pulled{" "}
								<code className="font-mono text-xs">{detectedNumber}</code> off
								this script but no roster row matches.{" "}
								{mode === "select"
									? "Pick the right student or add them now."
									: "Save the new student to link this script."}
							</>
						) : mode === "select" ? (
							"No student number was detected. Pick the right student manually."
						) : (
							"Add a new student to your roster and link this script."
						)}
					</DialogDescription>
				</DialogHeader>

				{mode === "select" ? (
					<div className="space-y-4">
						{studentsLoading ? (
							<p className="text-sm text-muted-foreground">Loading roster…</p>
						) : students.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								Your roster is empty. Add a student to link this script.
							</p>
						) : (
							<Select
								value={selectedId ?? undefined}
								onValueChange={setSelectedId}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a student">
										{(value: string | null) => {
											if (!value) return null
											const s = students.find((s) => s.id === value)
											if (!s) return value
											return (
												<span className="flex items-center gap-2">
													<span className="font-mono text-xs text-muted-foreground">
														{s.student_number}
													</span>
													<span>{s.name}</span>
												</span>
											)
										}}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{students.map((s) => (
										<SelectItem key={s.id} value={s.id}>
											<span className="font-mono text-xs text-muted-foreground">
												{s.student_number}
											</span>
											<span className="ml-2">{s.name}</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}

						<div className="flex items-center justify-between">
							{isRelink ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="gap-1.5 text-muted-foreground hover:text-destructive"
									onClick={() => unlinkMutation.mutate()}
									disabled={isPending}
								>
									{unlinkMutation.isPending ? "Unlinking…" : "Unlink"}
								</Button>
							) : (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="gap-1.5"
									onClick={() => setMode("create")}
									disabled={isPending}
								>
									<UserPlus className="size-3.5" strokeWidth={1.5} />
									Add new student
								</Button>
							)}
							<div className="flex gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={() => handleOpenChange(false)}
									disabled={isPending}
								>
									Cancel
								</Button>
								<Button
									type="button"
									onClick={() => selectedId && linkMutation.mutate(selectedId)}
									disabled={
										!selectedId || selectedId === currentStudentId || isPending
									}
								>
									{linkMutation.isPending
										? isRelink
											? "Updating…"
											: "Linking…"
										: isRelink
											? "Update"
											: "Link"}
								</Button>
							</div>
						</div>
					</div>
				) : (
					<div className="space-y-3">
						<StudentForm
							key={initialFormValue.student_number}
							initialValue={initialFormValue}
							submitting={createAndLinkMutation.isPending}
							onSubmit={async (values) => {
								await createAndLinkMutation.mutateAsync(values)
							}}
							onCancel={() => {
								if (students.length > 0) {
									setMode("select")
								} else {
									handleOpenChange(false)
								}
							}}
						/>
						{students.length > 0 && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="gap-1.5"
								onClick={() => setMode("select")}
								disabled={isPending}
							>
								<Plus className="size-3.5 rotate-45" strokeWidth={1.5} />
								Pick from roster instead
							</Button>
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}

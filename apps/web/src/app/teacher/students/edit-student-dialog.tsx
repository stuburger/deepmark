"use client"

import {
	StudentForm,
	type StudentFormValues,
} from "@/components/students/student-form"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { queryKeys } from "@/lib/query-keys"
import { updateStudent } from "@/lib/students/mutations"
import type { StudentRow } from "@/lib/students/queries"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

type Props = {
	student: StudentRow | null
	onClose: () => void
}

export function EditStudentDialog({ student, onClose }: Props) {
	const queryClient = useQueryClient()

	const mutation = useMutation({
		mutationFn: async (values: StudentFormValues) => {
			if (!student) throw new Error("No student selected")
			const r = await updateStudent({
				studentId: student.id,
				input: {
					name: values.name,
					student_number: values.student_number,
					class_name: values.class_name || null,
					year_group: values.year_group || null,
				},
			})
			if (r?.serverError) throw new Error(r.serverError)
			if (!r?.data) throw new Error("Failed to update student")
			return r.data
		},
		onSuccess: () => {
			toast.success("Student updated")
			queryClient.invalidateQueries({ queryKey: queryKeys.students() })
			onClose()
		},
		onError: (err) => toast.error(err.message),
	})

	const initialValue: StudentFormValues | null = student
		? {
				name: student.name,
				student_number: student.student_number,
				class_name: student.class_name ?? "",
				year_group: student.year_group ?? "",
			}
		: null

	return (
		<Dialog open={student !== null} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Edit student</DialogTitle>
					<DialogDescription>
						Changes to the name will cascade to every script already linked to
						this student.
					</DialogDescription>
				</DialogHeader>

				{initialValue && (
					<StudentForm
						key={student?.id}
						initialValue={initialValue}
						submitting={mutation.isPending}
						onSubmit={async (values) => {
							await mutation.mutateAsync(values)
						}}
						onCancel={onClose}
					/>
				)}
			</DialogContent>
		</Dialog>
	)
}

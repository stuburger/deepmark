"use client"

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { queryKeys } from "@/lib/query-keys"
import { createStudent } from "@/lib/students/mutations"
import { getNextStudentNumber } from "@/lib/students/queries"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { toast } from "sonner"
import {
	EMPTY_STUDENT,
	StudentForm,
	type StudentFormValues,
} from "./student-form"

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function NewStudentDialog({ open, onOpenChange }: Props) {
	const queryClient = useQueryClient()

	const { data: nextNumber, refetch: refetchNumber } = useQuery({
		queryKey: queryKeys.nextStudentNumber(),
		queryFn: async () => {
			const r = await getNextStudentNumber()
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data?.student_number ?? "S-001"
		},
		enabled: open,
		staleTime: 0,
	})

	useEffect(() => {
		if (open) refetchNumber()
	}, [open, refetchNumber])

	const initialValue: StudentFormValues = {
		...EMPTY_STUDENT,
		student_number: nextNumber ?? "",
	}

	const mutation = useMutation({
		mutationFn: async (values: StudentFormValues) => {
			const r = await createStudent({
				name: values.name,
				student_number: values.student_number,
				class_name: values.class_name || null,
				year_group: values.year_group || null,
			})
			if (r?.serverError) throw new Error(r.serverError)
			if (!r?.data) throw new Error("Failed to create student")
			return r.data
		},
		onSuccess: () => {
			toast.success("Student added")
			queryClient.invalidateQueries({ queryKey: queryKeys.students() })
			queryClient.invalidateQueries({
				queryKey: queryKeys.nextStudentNumber(),
			})
			onOpenChange(false)
		},
		onError: (err) => {
			toast.error(err.message)
		},
	})

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>New student</DialogTitle>
					<DialogDescription>
						Adds a row to your roster. The student number is what the OCR looks
						for on uploaded scripts.
					</DialogDescription>
				</DialogHeader>

				{nextNumber === undefined ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : (
					<StudentForm
						key={nextNumber}
						initialValue={initialValue}
						submitting={mutation.isPending}
						onSubmit={async (values) => {
							await mutation.mutateAsync(values)
						}}
						onCancel={() => onOpenChange(false)}
					/>
				)}
			</DialogContent>
		</Dialog>
	)
}

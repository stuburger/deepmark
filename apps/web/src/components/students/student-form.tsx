"use client"

import { Button } from "@/components/ui/button"
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

const studentFormSchema = z.object({
	name: z.string().trim().min(1, "Name is required"),
	student_number: z
		.string()
		.trim()
		.min(1, "Student number is required")
		.max(32, "Too long"),
	class_name: z.string().trim().max(64),
	year_group: z.string().trim().max(16),
})

export type StudentFormValues = z.infer<typeof studentFormSchema>

export const EMPTY_STUDENT: StudentFormValues = {
	name: "",
	student_number: "",
	class_name: "",
	year_group: "",
}

type Props = {
	initialValue: StudentFormValues
	submitting: boolean
	onSubmit: (values: StudentFormValues) => Promise<void> | void
	onCancel: () => void
}

export function StudentForm({
	initialValue,
	submitting,
	onSubmit,
	onCancel,
}: Props) {
	const form = useForm<StudentFormValues>({
		resolver: zodResolver(studentFormSchema),
		defaultValues: initialValue,
	})
	const {
		register,
		handleSubmit,
		formState: { errors },
	} = form

	return (
		<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="student-name">Name</FieldLabel>
					<Input
						id="student-name"
						placeholder="e.g. Stuart Bourhill"
						{...register("name")}
					/>
					{errors.name && <FieldError>{errors.name.message}</FieldError>}
				</Field>

				<Field>
					<FieldLabel htmlFor="student-number">Student number</FieldLabel>
					<Input
						id="student-number"
						placeholder="e.g. S-001"
						{...register("student_number")}
					/>
					{errors.student_number && (
						<FieldError>{errors.student_number.message}</FieldError>
					)}
				</Field>

				<div className="grid grid-cols-2 gap-4">
					<Field>
						<FieldLabel htmlFor="class-name">Class (optional)</FieldLabel>
						<Input
							id="class-name"
							placeholder="e.g. 11B"
							{...register("class_name")}
						/>
						{errors.class_name && (
							<FieldError>{errors.class_name.message}</FieldError>
						)}
					</Field>
					<Field>
						<FieldLabel htmlFor="year-group">Year group (optional)</FieldLabel>
						<Input
							id="year-group"
							placeholder="e.g. 11"
							{...register("year_group")}
						/>
						{errors.year_group && (
							<FieldError>{errors.year_group.message}</FieldError>
						)}
					</Field>
				</div>
			</FieldGroup>

			<div className="flex justify-end gap-2">
				<Button
					type="button"
					variant="outline"
					onClick={onCancel}
					disabled={submitting}
				>
					Cancel
				</Button>
				<Button type="submit" disabled={submitting}>
					{submitting ? "Saving…" : "Save student"}
				</Button>
			</div>
		</form>
	)
}

"use server"

import { authenticatedAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { redactName } from "@mcp-gcse/shared"
import { z } from "zod"

const createStudentInput = z.object({
	name: z.string().trim().min(1, "Name is required"),
	student_number: z
		.string()
		.trim()
		.min(1, "Student number is required")
		.max(32, "Student number is too long"),
	class_name: z.string().trim().max(64).optional().nullable(),
	year_group: z.string().trim().max(16).optional().nullable(),
})

export const createStudent = authenticatedAction
	.inputSchema(createStudentInput)
	.action(
		async ({
			parsedInput,
			ctx,
		}): Promise<{ id: string; student_number: string }> => {
			const existing = await db.student.findFirst({
				where: {
					teacher_id: ctx.user.id,
					student_number: parsedInput.student_number,
				},
				select: { id: true },
			})
			if (existing) {
				throw new Error(
					`Student number "${parsedInput.student_number}" is already in use`,
				)
			}
			const created = await db.student.create({
				data: {
					name: parsedInput.name,
					student_number: parsedInput.student_number,
					class_name: parsedInput.class_name || null,
					year_group: parsedInput.year_group || null,
					teacher_id: ctx.user.id,
				},
				select: { id: true, student_number: true },
			})
			return created
		},
	)

const updateStudentInput = z.object({
	studentId: z.string(),
	input: createStudentInput,
})

export const updateStudent = authenticatedAction
	.inputSchema(updateStudentInput)
	.action(
		async ({
			parsedInput: { studentId, input },
			ctx,
		}): Promise<{ id: string }> => {
			const existing = await db.student.findFirst({
				where: { id: studentId, teacher_id: ctx.user.id },
				select: { id: true, student_number: true },
			})
			if (!existing) throw new Error("Student not found")

			if (input.student_number !== existing.student_number) {
				const collision = await db.student.findFirst({
					where: {
						teacher_id: ctx.user.id,
						student_number: input.student_number,
						NOT: { id: studentId },
					},
					select: { id: true },
				})
				if (collision) {
					throw new Error(
						`Student number "${input.student_number}" is already in use`,
					)
				}
			}

			// Submission.student_name is denormalised — when the canonical name
			// changes on the Student record, every linked submission's redacted
			// label needs to follow. Cascading here keeps the table honest.
			const redacted = redactName(input.name)
			await db.$transaction([
				db.student.update({
					where: { id: studentId },
					data: {
						name: input.name,
						student_number: input.student_number,
						class_name: input.class_name || null,
						year_group: input.year_group || null,
					},
				}),
				db.studentSubmission.updateMany({
					where: { student_id: studentId },
					data: { student_name: redacted },
				}),
			])

			return { id: studentId }
		},
	)

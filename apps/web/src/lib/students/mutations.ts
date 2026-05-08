"use server"

import { authenticatedAction } from "@/lib/authz"
import { db } from "@/lib/db"
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

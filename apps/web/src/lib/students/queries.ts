"use server"

import { authenticatedAction } from "@/lib/authz"
import { db } from "@/lib/db"

export type StudentRow = {
	id: string
	name: string
	student_number: string
	class_name: string | null
	year_group: string | null
	submission_count: number
}

export const listStudents = authenticatedAction.action(
	async ({ ctx }): Promise<{ students: StudentRow[] }> => {
		const rows = await db.student.findMany({
			where: { teacher_id: ctx.user.id },
			orderBy: [{ student_number: "asc" }],
			select: {
				id: true,
				name: true,
				student_number: true,
				class_name: true,
				year_group: true,
				_count: { select: { student_submissions: true } },
			},
		})
		return {
			students: rows.map((r) => ({
				id: r.id,
				name: r.name,
				student_number: r.student_number,
				class_name: r.class_name,
				year_group: r.year_group,
				submission_count: r._count.student_submissions,
			})),
		}
	},
)

// Walks the teacher's existing S-NNN numbers and returns max+1. Teacher
// overrides in other formats (e.g. "T-12") are ignored — they live in their
// own namespace and don't collide with the S-series.
export const getNextStudentNumber = authenticatedAction.action(
	async ({ ctx }): Promise<{ student_number: string }> => {
		const rows = await db.student.findMany({
			where: { teacher_id: ctx.user.id },
			select: { student_number: true },
		})
		const maxNum = rows.reduce((max, r) => {
			const m = r.student_number.match(/^S-(\d+)$/)
			if (!m?.[1]) return max
			const n = Number.parseInt(m[1], 10)
			return Number.isNaN(n) ? max : Math.max(max, n)
		}, 0)
		return {
			student_number: `S-${(maxNum + 1).toString().padStart(3, "0")}`,
		}
	},
)

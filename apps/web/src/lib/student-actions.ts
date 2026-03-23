"use server"

import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "./auth"

const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

export type StudentItem = {
	id: string
	name: string
	class_name: string | null
	year_group: string | null
	created_at: Date
}

export type ListStudentsResult =
	| { ok: true; students: StudentItem[] }
	| { ok: false; error: string }

export async function listStudents(): Promise<ListStudentsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const students = await db.student.findMany({
		where: { teacher_id: session.userId },
		orderBy: { name: "asc" },
		select: {
			id: true,
			name: true,
			class_name: true,
			year_group: true,
			created_at: true,
		},
	})

	return { ok: true, students }
}

export type CreateStudentResult =
	| { ok: true; student: StudentItem }
	| { ok: false; error: string }

export async function createStudent(
	name: string,
	className?: string,
	yearGroup?: string,
): Promise<CreateStudentResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	if (!name.trim()) return { ok: false, error: "Name is required" }

	const student = await db.student.create({
		data: {
			name: name.trim(),
			class_name: className?.trim() || null,
			year_group: yearGroup?.trim() || null,
			teacher_id: session.userId,
		},
	})

	return {
		ok: true,
		student: {
			id: student.id,
			name: student.name,
			class_name: student.class_name,
			year_group: student.year_group,
			created_at: student.created_at,
		},
	}
}

export type UpdateStudentResult = { ok: true } | { ok: false; error: string }

export async function updateStudent(
	id: string,
	data: { name?: string; class_name?: string; year_group?: string },
): Promise<UpdateStudentResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const student = await db.student.findFirst({
		where: { id, teacher_id: session.userId },
	})
	if (!student) return { ok: false, error: "Student not found" }

	await db.student.update({
		where: { id },
		data: {
			...(data.name?.trim() ? { name: data.name.trim() } : {}),
			...(data.class_name !== undefined
				? { class_name: data.class_name?.trim() || null }
				: {}),
			...(data.year_group !== undefined
				? { year_group: data.year_group?.trim() || null }
				: {}),
		},
	})

	return { ok: true }
}

"use server"

import { createPrismaClient } from "@mcp-gcse/db"
import type { Subject } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../auth"

const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

export type CreateExamPaperFromJobResult =
	| { ok: true; examPaperId: string }
	| { ok: false; error: string }

export async function createExamPaperFromJob(input: {
	job_id: string
	title: string
	subject: Subject
	exam_board: string
	total_marks: number
	duration_minutes: number
	year?: number
	paper_number?: number
}): Promise<CreateExamPaperFromJobResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const job = await db.pdfIngestionJob.findFirst({
		where: { id: input.job_id, uploaded_by: session.userId },
	})
	if (!job) return { ok: false, error: "Job not found" }
	if (job.status !== "ocr_complete") {
		return { ok: false, error: "Job has not completed processing" }
	}
	if (
		job.document_type !== "mark_scheme" &&
		job.document_type !== "question_paper"
	) {
		return {
			ok: false,
			error:
				"Only mark scheme and question paper jobs can create an exam paper",
		}
	}

	const questions = await db.question.findMany({
		where: { source_pdf_ingestion_job_id: input.job_id },
		orderBy: { created_at: "asc" },
	})
	if (questions.length === 0) {
		return { ok: false, error: "No questions found for this job" }
	}

	const examPaper = await db.examPaper.create({
		data: {
			title: input.title,
			subject: input.subject,
			exam_board: input.exam_board,
			year: input.year ?? new Date().getFullYear(),
			paper_number: input.paper_number ?? null,
			total_marks: input.total_marks,
			duration_minutes: input.duration_minutes,
			created_by_id: session.userId,
		},
	})
	await db.examSection.create({
		data: {
			exam_paper_id: examPaper.id,
			title: "Section 1",
			total_marks: input.total_marks,
			order: 0,
			created_by_id: session.userId,
		},
	})
	const section = await db.examSection.findFirst({
		where: { exam_paper_id: examPaper.id },
	})
	if (!section) return { ok: false, error: "Failed to create section" }
	for (let i = 0; i < questions.length; i++) {
		await db.examSectionQuestion.create({
			data: {
				exam_section_id: section.id,
				question_id: questions[i]?.id ?? "",
				order: i + 1,
			},
		})
	}
	return { ok: true, examPaperId: examPaper.id }
}

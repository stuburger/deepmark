"use server"

import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../auth"
import { log } from "../logger"
import type { ActiveExamPaperIngestionJob, PdfDocument } from "./types"
export type { ActiveExamPaperIngestionJob, PdfDocument } from "./types"

const TAG = "pdf-ingestion-actions"
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

export type GetActiveIngestionJobsForExamPaperResult =
	| { ok: true; jobs: ActiveExamPaperIngestionJob[] }
	| { ok: false; error: string }

export type GetPdfDocumentsForPaperResult =
	| { ok: true; documents: PdfDocument[] }
	| { ok: false; error: string }

export type ExamPaperIngestionLiveState = {
	jobs: ActiveExamPaperIngestionJob[]
	documents: PdfDocument[]
}

export type CheckExistingDocumentResult =
	| { ok: true; exists: false }
	| { ok: true; exists: true; questionCount: number; exemplarCount: number }
	| { ok: false; error: string }

export type ArchiveExistingDocumentResult =
	| { ok: true }
	| { ok: false; error: string }

/**
 * Returns in-progress jobs linked to this exam paper (for teacher UI polling),
 * plus any recently failed/cancelled jobs so the teacher can see what went wrong.
 */
export async function getActiveIngestionJobsForExamPaper(
	examPaperId: string,
): Promise<GetActiveIngestionJobsForExamPaperResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const jobs = await db.pdfIngestionJob.findMany({
		where: {
			exam_paper_id: examPaperId,
			uploaded_by: session.userId,
			OR: [
				// Actively running
				{ status: { notIn: ["ocr_complete", "failed", "cancelled"] } },
				// Failed/cancelled within the last hour — shown so the teacher can see the error
				{
					status: { in: ["failed", "cancelled"] },
					created_at: { gte: new Date(Date.now() - 60 * 60 * 1000) },
				},
			],
		},
		orderBy: { created_at: "desc" },
		select: {
			id: true,
			document_type: true,
			status: true,
			error: true,
		},
	})
	return {
		ok: true,
		jobs: jobs.map((j) => ({
			id: j.id,
			document_type: j.document_type,
			status: j.status,
			error: j.error,
		})),
	}
}

/**
 * Returns all successfully completed ingestion jobs for an exam paper.
 * Used to populate the PDF documents panel on the exam paper detail page.
 */
export async function getPdfDocumentsForPaper(
	examPaperId: string,
): Promise<GetPdfDocumentsForPaperResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const jobs = await db.pdfIngestionJob.findMany({
		where: {
			exam_paper_id: examPaperId,
			status: "ocr_complete",
		},
		orderBy: { processed_at: "desc" },
		select: {
			id: true,
			document_type: true,
			processed_at: true,
		},
	})
	return {
		ok: true,
		documents: jobs.map((j) => ({
			id: j.id,
			document_type: j.document_type,
			processed_at: j.processed_at,
		})),
	}
}

const INGESTION_UI_TERMINAL = new Set(["ocr_complete", "failed", "cancelled"])

/**
 * Single DB read for the exam paper detail page: completed PDFs (all uploaders)
 * plus in-progress / recent-failure jobs for the current user only.
 * Poll this from one place to drive upload cards + processing banners.
 */
export async function getExamPaperIngestionLiveState(
	examPaperId: string,
): Promise<
	| { ok: true; jobs: ActiveExamPaperIngestionJob[]; documents: PdfDocument[] }
	| { ok: false; error: string }
> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

	const rows = await db.pdfIngestionJob.findMany({
		where: { exam_paper_id: examPaperId },
		orderBy: { created_at: "desc" },
		take: 200,
		select: {
			id: true,
			document_type: true,
			status: true,
			error: true,
			processed_at: true,
			created_at: true,
			uploaded_by: true,
		},
	})

	const documents: PdfDocument[] = []
	const jobs: ActiveExamPaperIngestionJob[] = []

	for (const j of rows) {
		if (j.status === "ocr_complete") {
			documents.push({
				id: j.id,
				document_type: j.document_type,
				processed_at: j.processed_at,
			})
			continue
		}
		if (j.uploaded_by !== session.userId) continue

		const isNonTerminal = !INGESTION_UI_TERMINAL.has(j.status)
		const isRecentFailure =
			(j.status === "failed" || j.status === "cancelled") &&
			j.created_at >= oneHourAgo
		if (isNonTerminal || isRecentFailure) {
			jobs.push({
				id: j.id,
				document_type: j.document_type,
				status: j.status,
				error: j.error,
			})
		}
	}

	documents.sort((a, b) => {
		const ta = a.processed_at?.getTime() ?? 0
		const tb = b.processed_at?.getTime() ?? 0
		return tb - ta
	})

	return { ok: true, jobs, documents }
}

export async function checkExistingDocument(
	examPaperId: string,
	documentType: "mark_scheme" | "exemplar" | "question_paper",
): Promise<CheckExistingDocumentResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const jobs = await db.pdfIngestionJob.findMany({
		where: {
			exam_paper_id: examPaperId,
			document_type: documentType,
			status: "ocr_complete",
		},
		select: {
			id: true,
			_count: { select: { created_questions: true, exemplars: true } },
		},
	})

	if (jobs.length === 0) return { ok: true, exists: false }

	const questionCount = jobs.reduce(
		(sum, j) => sum + j._count.created_questions,
		0,
	)
	const exemplarCount = jobs.reduce((sum, j) => sum + j._count.exemplars, 0)

	return { ok: true, exists: true, questionCount, exemplarCount }
}

export async function archiveExistingDocument(
	examPaperId: string,
	documentType: "mark_scheme" | "exemplar" | "question_paper",
): Promise<ArchiveExistingDocumentResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const jobs = await db.pdfIngestionJob.findMany({
		where: {
			exam_paper_id: examPaperId,
			document_type: documentType,
			status: "ocr_complete",
		},
		select: { id: true },
	})

	if (jobs.length === 0) return { ok: true }

	const jobIds = jobs.map((j) => j.id)

	log.info(TAG, "archiveExistingDocument called", {
		userId: session.userId,
		examPaperId,
		documentType,
		jobCount: jobs.length,
	})

	if (documentType === "exemplar") {
		await db.exemplarAnswer.deleteMany({
			where: { pdf_ingestion_job_id: { in: jobIds } },
		})
	} else {
		const questions = await db.question.findMany({
			where: { source_pdf_ingestion_job_id: { in: jobIds } },
			select: { id: true },
		})
		await db.examSectionQuestion.deleteMany({
			where: { question_id: { in: questions.map((q) => q.id) } },
		})
	}

	log.info(TAG, "archiveExistingDocument complete", {
		examPaperId,
		documentType,
	})

	return { ok: true }
}

"use server"

import { resourceAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { z } from "zod"
import type { ActiveExamPaperIngestionJob, PdfDocument } from "./types"

export type { ActiveExamPaperIngestionJob, PdfDocument } from "./types"

const examPaperInput = z.object({ examPaperId: z.string() })

const documentTypeEnum = z.enum(["mark_scheme", "exemplar", "question_paper"])

/**
 * Returns in-progress jobs linked to this exam paper (for teacher UI polling),
 * plus any recently failed/cancelled jobs so the teacher can see what went wrong.
 */
export const getActiveIngestionJobsForExamPaper = resourceAction({
	type: "examPaper",
	role: "viewer",
	schema: examPaperInput,
	id: ({ examPaperId }) => examPaperId,
}).action(
	async ({
		parsedInput: { examPaperId },
	}): Promise<{ jobs: ActiveExamPaperIngestionJob[] }> => {
		const jobs = await db.pdfIngestionJob.findMany({
			where: {
				exam_paper_id: examPaperId,
				OR: [
					{ status: { notIn: ["ocr_complete", "failed", "cancelled"] } },
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
			jobs: jobs.map((j) => ({
				id: j.id,
				document_type: j.document_type,
				status: j.status,
				error: j.error,
			})),
		}
	},
)

/**
 * Returns all successfully completed ingestion jobs for an exam paper.
 * Used to populate the PDF documents panel on the exam paper detail page.
 */
export const getPdfDocumentsForPaper = resourceAction({
	type: "examPaper",
	role: "viewer",
	schema: examPaperInput,
	id: ({ examPaperId }) => examPaperId,
}).action(
	async ({
		parsedInput: { examPaperId },
	}): Promise<{ documents: PdfDocument[] }> => {
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
			documents: jobs.map((j) => ({
				id: j.id,
				document_type: j.document_type,
				processed_at: j.processed_at,
			})),
		}
	},
)

const INGESTION_UI_TERMINAL = new Set(["ocr_complete", "failed", "cancelled"])

/**
 * Single DB read for the exam paper detail page: completed PDFs (all uploaders)
 * plus in-progress / recent-failure jobs.
 * Poll this from one place to drive upload cards + processing banners.
 */
export const getExamPaperIngestionLiveState = resourceAction({
	type: "examPaper",
	role: "viewer",
	schema: examPaperInput,
	id: ({ examPaperId }) => examPaperId,
}).action(
	async ({
		parsedInput: { examPaperId },
	}): Promise<{
		jobs: ActiveExamPaperIngestionJob[]
		documents: PdfDocument[]
	}> => {
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

		return { jobs, documents }
	},
)

export const checkExistingDocument = resourceAction({
	type: "examPaper",
	role: "viewer",
	schema: z.object({
		examPaperId: z.string(),
		documentType: documentTypeEnum,
	}),
	id: ({ examPaperId }) => examPaperId,
}).action(
	async ({
		parsedInput: { examPaperId, documentType },
	}): Promise<
		| { exists: false }
		| { exists: true; questionCount: number; exemplarCount: number }
	> => {
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

		if (jobs.length === 0) return { exists: false }

		const questionCount = jobs.reduce(
			(sum, j) => sum + j._count.created_questions,
			0,
		)
		const exemplarCount = jobs.reduce((sum, j) => sum + j._count.exemplars, 0)

		return { exists: true, questionCount, exemplarCount }
	},
)

export const archiveExistingDocument = resourceAction({
	type: "examPaper",
	role: "editor",
	schema: z.object({
		examPaperId: z.string(),
		documentType: documentTypeEnum,
	}),
	id: ({ examPaperId }) => examPaperId,
}).action(
	async ({
		parsedInput: { examPaperId, documentType },
		ctx,
	}): Promise<{ ok: true }> => {
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

		ctx.log.info("archiveExistingDocument called", {
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

		ctx.log.info("archiveExistingDocument complete", {
			examPaperId,
			documentType,
		})

		return { ok: true }
	},
)

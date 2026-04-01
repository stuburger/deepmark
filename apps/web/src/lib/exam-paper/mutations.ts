"use server"

import { createPrismaClient } from "@mcp-gcse/db"
import type { Subject } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../auth"
import { log } from "../logger"

const TAG = "exam-paper/mutations"
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

// ─── Create ───────────────────────────────────────────────────────────────────

export type CreateExamPaperInput = {
	title: string
	subject: Subject
	exam_board: string
	year: number
	paper_number?: number
	total_marks: number
	duration_minutes: number
	is_public?: boolean
}

export type CreateExamPaperResult =
	| { ok: true; id: string }
	| { ok: false; error: string }

export async function createExamPaperStandalone(
	input: CreateExamPaperInput,
): Promise<CreateExamPaperResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	log.info(TAG, "createExamPaperStandalone called", {
		userId: session.userId,
		title: input.title,
		subject: input.subject,
		is_public: input.is_public,
	})
	try {
		const paper = await db.examPaper.create({
			data: {
				title: input.title,
				subject: input.subject,
				exam_board: input.exam_board || null,
				year: input.year,
				paper_number: input.paper_number ?? null,
				total_marks: input.total_marks,
				duration_minutes: input.duration_minutes,
				is_public: input.is_public ?? false,
				created_by_id: session.userId,
			},
		})
		log.info(TAG, "Exam paper created", {
			userId: session.userId,
			id: paper.id,
			title: paper.title,
		})
		return { ok: true, id: paper.id }
	} catch (err) {
		log.error(TAG, "createExamPaperStandalone failed", { error: String(err) })
		return { ok: false, error: "Failed to create exam paper" }
	}
}

// ─── Update ───────────────────────────────────────────────────────────────────

export type UpdateExamPaperTitleResult =
	| { ok: true }
	| { ok: false; error: string }

export async function updateExamPaperTitle(
	id: string,
	title: string,
): Promise<UpdateExamPaperTitleResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const trimmed = title.trim()
	if (!trimmed) return { ok: false, error: "Title cannot be empty" }
	log.info(TAG, "updateExamPaperTitle called", { userId: session.userId, id })
	try {
		await db.examPaper.update({ where: { id }, data: { title: trimmed } })
		log.info(TAG, "Exam paper title updated", { id })
		return { ok: true }
	} catch (err) {
		log.error(TAG, "updateExamPaperTitle failed", { id, error: String(err) })
		return { ok: false, error: "Failed to update exam paper title" }
	}
}

export type ToggleExamPaperPublicResult =
	| { ok: true }
	| { ok: false; error: string }

export async function toggleExamPaperPublic(
	id: string,
	is_public: boolean,
): Promise<ToggleExamPaperPublicResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	log.info(TAG, "toggleExamPaperPublic called", {
		userId: session.userId,
		id,
		is_public,
	})
	try {
		await db.examPaper.update({ where: { id }, data: { is_public } })
		log.info(TAG, "Exam paper visibility updated", { id, is_public })
		return { ok: true }
	} catch (err) {
		log.error(TAG, "toggleExamPaperPublic failed", { id, error: String(err) })
		return { ok: false, error: "Failed to update exam paper" }
	}
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export type DeleteExamPaperResult = { ok: true } | { ok: false; error: string }

/**
 * Fully deletes an exam paper and all associated data in a transaction.
 *
 * Cascade order (child-first to avoid FK violations):
 *  1. MarkSchemeTestRun → MarkScheme → Question (from paper jobs)
 *  2. ExemplarAnswer (from paper jobs)
 *  3. QuestionBankItem for questions in this paper
 *  4. MarkingResult / Answer for those questions
 *  5. ExamSectionQuestion → ExamSection
 *  6. PdfIngestionJob
 *  7. ExamPaper
 */
export async function deleteExamPaper(
	id: string,
): Promise<DeleteExamPaperResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	log.info(TAG, "deleteExamPaper called", { userId: session.userId, id })

	try {
		await db.$transaction(
			async (tx) => {
				const sections = await tx.examSection.findMany({
					where: { exam_paper_id: id },
					select: { id: true },
				})
				const sectionIds = sections.map((s) => s.id)

				const sectionQuestions = await tx.examSectionQuestion.findMany({
					where: { exam_section_id: { in: sectionIds } },
					select: { question_id: true },
				})

				const jobs = await tx.pdfIngestionJob.findMany({
					where: { exam_paper_id: id },
					select: { id: true },
				})
				const jobIds = jobs.map((j) => j.id)

				const jobQuestions = await tx.question.findMany({
					where: { source_pdf_ingestion_job_id: { in: jobIds } },
					select: { id: true },
				})

				const questionIds = [
					...new Set([
						...sectionQuestions.map((sq) => sq.question_id),
						...jobQuestions.map((q) => q.id),
					]),
				]

				const markSchemes = await tx.markScheme.findMany({
					where: { question_id: { in: questionIds } },
					select: { id: true },
				})
				const markSchemeIds = markSchemes.map((ms) => ms.id)

				const answers = await tx.answer.findMany({
					where: { question_id: { in: questionIds } },
					select: { id: true },
				})
				const answerIds = answers.map((a) => a.id)

				await tx.markSchemeTestRun.deleteMany({
					where: { mark_scheme_id: { in: markSchemeIds } },
				})

				await tx.exemplarAnswer.deleteMany({
					where: {
						OR: [
							{ mark_scheme_id: { in: markSchemeIds } },
							{ pdf_ingestion_job_id: { in: jobIds } },
						],
					},
				})

				await tx.markScheme.deleteMany({
					where: { question_id: { in: questionIds } },
				})

				await tx.questionBankItem.deleteMany({
					where: { question_id: { in: questionIds } },
				})

				await tx.markingResult.deleteMany({
					where: { answer_id: { in: answerIds } },
				})
				await tx.answer.deleteMany({
					where: { question_id: { in: questionIds } },
				})

				await tx.examSectionQuestion.deleteMany({
					where: { exam_section_id: { in: sectionIds } },
				})
				await tx.examSection.deleteMany({ where: { exam_paper_id: id } })

				await tx.question.deleteMany({
					where: { source_pdf_ingestion_job_id: { in: jobIds } },
				})

				await tx.pdfIngestionJob.deleteMany({ where: { exam_paper_id: id } })

				await tx.examPaper.delete({ where: { id } })
			},
			{ timeout: 30000 },
		)

		log.info(TAG, "Exam paper deleted", { userId: session.userId, id })
		return { ok: true }
	} catch (err) {
		log.error(TAG, "deleteExamPaper failed", {
			userId: session.userId,
			id,
			error: String(err),
		})
		return { ok: false, error: "Failed to delete exam paper" }
	}
}

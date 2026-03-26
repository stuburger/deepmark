"use server"

import { GoogleGenAI } from "@google/genai"
import { createPrismaClient } from "@mcp-gcse/db"
import type { Subject } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "./auth"
import { log } from "./logger"

const EMBEDDING_DIMENSIONS = 1536

const TAG = "dashboard-actions"
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

export type DashboardStats = {
	totalUsers: number
	totalQuestions: number
	totalExamPapers: number
	totalQuestionBanks: number
	pendingAnswers: number
	completedAnswers: number
	failedAnswers: number
	totalStudentPaperJobs: number
	activeStudentPaperJobs: number
	markSchemesNeedingReview: number
}

export type MarkingStatusBreakdown = {
	status: string
	count: number
}

export type QuestionsBySubject = {
	subject: string
	count: number
}

export type UsersByRole = {
	role: string
	count: number
}

export type DashboardData = {
	stats: DashboardStats
	markingStatusBreakdown: MarkingStatusBreakdown[]
	questionsBySubject: QuestionsBySubject[]
	usersByRole: UsersByRole[]
}

export type QuestionListItem = {
	id: string
	text: string
	topic: string
	subject: string
	points: number | null
	difficulty_level: string | null
	question_type: string
	origin: string
	created_at: Date
	_count: {
		question_parts: number
		mark_schemes: number
		answers: number
	}
}

export type ListQuestionsResult =
	| { ok: true; questions: QuestionListItem[] }
	| { ok: false; error: string }

export async function listQuestions(): Promise<ListQuestionsResult> {
	try {
		const questions = await db.question.findMany({
			orderBy: { created_at: "desc" },
			select: {
				id: true,
				text: true,
				topic: true,
				subject: true,
				points: true,
				difficulty_level: true,
				question_type: true,
				origin: true,
				created_at: true,
				_count: {
					select: {
						question_parts: true,
						mark_schemes: true,
						answers: true,
					},
				},
			},
		})
		return { ok: true, questions }
	} catch {
		return { ok: false, error: "Failed to load questions" }
	}
}

export type ExamPaperListItem = {
	id: string
	title: string
	subject: string
	exam_board: string | null
	year: number
	paper_number: number | null
	total_marks: number
	duration_minutes: number
	is_active: boolean
	is_public: boolean
	created_at: Date
	_count: {
		sections: number
		pdf_ingestion_jobs: number
	}
}

export type ListExamPapersResult =
	| { ok: true; papers: ExamPaperListItem[] }
	| { ok: false; error: string }

export async function listExamPapers(options?: {
	publicOnly?: boolean
}): Promise<ListExamPapersResult> {
	try {
		const papers = await db.examPaper.findMany({
			where: options?.publicOnly
				? { is_public: true, is_active: true }
				: undefined,
			orderBy: [{ year: "desc" }, { created_at: "desc" }],
			select: {
				id: true,
				title: true,
				subject: true,
				exam_board: true,
				year: true,
				paper_number: true,
				total_marks: true,
				duration_minutes: true,
				is_active: true,
				is_public: true,
				created_at: true,
				_count: {
					select: {
						sections: true,
						pdf_ingestion_jobs: true,
					},
				},
			},
		})
		return { ok: true, papers }
	} catch {
		return { ok: false, error: "Failed to load exam papers" }
	}
}

export type ExemplarValidationStats = {
	total: number
	passed: number
	accuracyPercent: number
}

export type ExemplarAnswerListItem = {
	id: string
	pdf_ingestion_job_id: string
	raw_question_text: string
	source_exam_board: string
	level: number
	is_fake_exemplar: boolean
	answer_text: string
	word_count: number | null
	mark_band: string | null
	expected_score: number | null
	created_at: Date
	question: { id: string; text: string; subject: string } | null
	question_part: { id: string; part_label: string } | null
	validation: ExemplarValidationStats | null
}

export type ListExemplarAnswersResult =
	| { ok: true; exemplars: ExemplarAnswerListItem[] }
	| { ok: false; error: string }

export async function listExemplarAnswers(): Promise<ListExemplarAnswersResult> {
	try {
		const raw = await db.exemplarAnswer.findMany({
			orderBy: { created_at: "desc" },
			select: {
				id: true,
				pdf_ingestion_job_id: true,
				raw_question_text: true,
				source_exam_board: true,
				level: true,
				is_fake_exemplar: true,
				answer_text: true,
				word_count: true,
				mark_band: true,
				expected_score: true,
				created_at: true,
				question: {
					select: { id: true, text: true, subject: true },
				},
				question_part: {
					select: { id: true, part_label: true },
				},
				test_runs: {
					where: { triggered_by: "exemplar_validation" },
					select: { converged: true },
				},
			},
		})

		const exemplars: ExemplarAnswerListItem[] = raw.map((e) => {
			const runs = e.test_runs
			const validation: ExemplarValidationStats | null =
				runs.length > 0
					? {
							total: runs.length,
							passed: runs.filter((r) => r.converged).length,
							accuracyPercent: Math.round(
								(runs.filter((r) => r.converged).length / runs.length) * 100,
							),
						}
					: null
			return {
				id: e.id,
				pdf_ingestion_job_id: e.pdf_ingestion_job_id,
				raw_question_text: e.raw_question_text,
				source_exam_board: e.source_exam_board,
				level: e.level,
				is_fake_exemplar: e.is_fake_exemplar,
				answer_text: e.answer_text,
				word_count: e.word_count,
				mark_band: e.mark_band,
				expected_score: e.expected_score,
				created_at: e.created_at,
				question: e.question,
				question_part: e.question_part,
				validation,
			}
		})

		return { ok: true, exemplars }
	} catch {
		return { ok: false, error: "Failed to load exemplar answers" }
	}
}

export async function getDashboardData(): Promise<DashboardData> {
	const [
		totalUsers,
		totalQuestions,
		totalExamPapers,
		totalQuestionBanks,
		pendingAnswers,
		completedAnswers,
		failedAnswers,
		totalStudentPaperJobs,
		activeStudentPaperJobs,
		markSchemesNeedingReview,
		answersByStatus,
		questionsBySubjectRaw,
		usersByRoleRaw,
	] = await Promise.all([
		db.user.count(),
		db.question.count(),
		db.examPaper.count({ where: { is_active: true } }),
		db.questionBank.count({ where: { is_active: true } }),
		db.answer.count({ where: { marking_status: "pending" } }),
		db.answer.count({ where: { marking_status: "completed" } }),
		db.answer.count({ where: { marking_status: "failed" } }),
		db.studentPaperJob.count(),
		db.studentPaperJob.count({
			where: {
				status: {
					notIn: ["ocr_complete", "failed", "cancelled"],
				},
			},
		}),
		db.markScheme.count({
			where: { link_status: { in: ["unlinked", "auto_linked"] } },
		}),
		db.answer.groupBy({ by: ["marking_status"], _count: { id: true } }),
		db.question.groupBy({ by: ["subject"], _count: { id: true } }),
		db.user.groupBy({ by: ["role"], _count: { id: true } }),
	])

	return {
		stats: {
			totalUsers,
			totalQuestions,
			totalExamPapers,
			totalQuestionBanks,
			pendingAnswers,
			completedAnswers,
			failedAnswers,
			totalStudentPaperJobs,
			activeStudentPaperJobs,
			markSchemesNeedingReview,
		},
		markingStatusBreakdown: answersByStatus.map((row) => ({
			status: row.marking_status,
			count: row._count.id,
		})),
		questionsBySubject: questionsBySubjectRaw.map((row) => ({
			subject: row.subject,
			count: row._count.id,
		})),
		usersByRole: usersByRoleRaw.map((row) => ({
			role: row.role,
			count: row._count.id,
		})),
	}
}

// ─── Exam Paper Catalog ───────────────────────────────────────────────────────

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

export type ToggleExamPaperPublicResult =
	| { ok: true }
	| { ok: false; error: string }

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

export type ExamPaperQuestion = {
	id: string
	text: string
	question_type: string
	points: number | null
	origin: string
	mark_scheme_count: number
	mark_scheme_status: string | null
	mark_scheme_id: string | null
	mark_scheme_description: string | null
	order: number
	exam_section_id: string
	section_title: string
	question_number: string | null
	multiple_choice_options: { option_label: string; option_text: string }[]
}

export type ExamPaperSection = {
	id: string
	title: string
}

export type ExamPaperDetail = {
	id: string
	title: string
	subject: string
	exam_board: string | null
	year: number
	paper_number: number | null
	total_marks: number
	duration_minutes: number
	is_active: boolean
	is_public: boolean
	created_at: Date
	sections: ExamPaperSection[]
	questions: ExamPaperQuestion[]
	section_count: number
}

export type GetExamPaperDetailResult =
	| { ok: true; paper: ExamPaperDetail }
	| { ok: false; error: string }

export async function getExamPaperDetail(
	id: string,
): Promise<GetExamPaperDetailResult> {
	try {
		const paper = await db.examPaper.findUnique({
			where: { id },
			include: {
				sections: {
					orderBy: { order: "asc" },
					include: {
						exam_section_questions: {
							orderBy: { order: "asc" },
							include: {
								question: {
									select: {
										id: true,
										text: true,
										question_type: true,
										points: true,
										origin: true,
										question_number: true,
										multiple_choice_options: true,
										mark_schemes: {
											select: {
												id: true,
												link_status: true,
												description: true,
											},
											take: 1,
										},
									},
								},
							},
						},
					},
				},
			},
		})
		if (!paper) return { ok: false, error: "Exam paper not found" }

		const sections: ExamPaperSection[] = paper.sections.map((s) => ({
			id: s.id,
			title: s.title,
		}))

		const questions: ExamPaperQuestion[] = []
		for (const section of paper.sections) {
			for (const esq of section.exam_section_questions) {
				const ms = esq.question.mark_schemes[0]
				const mcqOptions = Array.isArray(esq.question.multiple_choice_options)
					? (esq.question.multiple_choice_options as {
							option_label: string
							option_text: string
						}[])
					: []
				questions.push({
					id: esq.question.id,
					text: esq.question.text,
					question_type: esq.question.question_type,
					points: esq.question.points,
					origin: esq.question.origin,
					question_number: esq.question.question_number,
					multiple_choice_options: mcqOptions,
					mark_scheme_count: esq.question.mark_schemes.length,
					mark_scheme_status: ms?.link_status ?? null,
					mark_scheme_id: ms?.id ?? null,
					mark_scheme_description: ms?.description ?? null,
					order: esq.order,
					exam_section_id: section.id,
					section_title: section.title,
				})
			}
		}

		return {
			ok: true,
			paper: {
				id: paper.id,
				title: paper.title,
				subject: paper.subject,
				exam_board: paper.exam_board,
				year: paper.year,
				paper_number: paper.paper_number,
				total_marks: paper.total_marks,
				duration_minutes: paper.duration_minutes,
				is_active: paper.is_active,
				is_public: paper.is_public,
				created_at: paper.created_at,
				sections,
				questions,
				section_count: paper.sections.length,
			},
		}
	} catch {
		return { ok: false, error: "Failed to load exam paper" }
	}
}

export type CatalogExamPaper = {
	id: string
	title: string
	subject: string
	exam_board: string | null
	year: number
	paper_number: number | null
	total_marks: number
	question_count: number
	has_mark_scheme: boolean
}

export type ListCatalogExamPapersResult =
	| { ok: true; papers: CatalogExamPaper[] }
	| { ok: false; error: string }

export async function listCatalogExamPapers(): Promise<ListCatalogExamPapersResult> {
	try {
		const papers = await db.examPaper.findMany({
			where: { is_public: true, is_active: true },
			orderBy: [{ subject: "asc" }, { year: "desc" }],
			select: {
				id: true,
				title: true,
				subject: true,
				exam_board: true,
				year: true,
				paper_number: true,
				total_marks: true,
				sections: {
					select: {
						exam_section_questions: {
							select: {
								question: {
									select: {
										_count: { select: { mark_schemes: true } },
									},
								},
							},
						},
					},
				},
			},
		})
		return {
			ok: true,
			papers: papers.map((p) => {
				const allQuestions = p.sections.flatMap(
					(sec) => sec.exam_section_questions,
				)
				return {
					id: p.id,
					title: p.title,
					subject: p.subject,
					exam_board: p.exam_board,
					year: p.year,
					paper_number: p.paper_number,
					total_marks: p.total_marks,
					question_count: allQuestions.length,
					has_mark_scheme: allQuestions.some(
						(esq) => esq.question._count.mark_schemes > 0,
					),
				}
			}),
		}
	} catch {
		return { ok: false, error: "Failed to load catalog" }
	}
}

// ─── Delete Exam Paper ────────────────────────────────────────────────────────

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
				// ── Collect IDs we'll need ──────────────────────────────────────

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

				// Also include questions that were created from this paper's ingestion
				// jobs but may not be linked to any section yet (no FK guard for them).
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

				// ── Delete in dependency order ──────────────────────────────────

				// Mark scheme test runs
				await tx.markSchemeTestRun.deleteMany({
					where: { mark_scheme_id: { in: markSchemeIds } },
				})

				// Exemplar answers linked to mark schemes or jobs
				await tx.exemplarAnswer.deleteMany({
					where: {
						OR: [
							{ mark_scheme_id: { in: markSchemeIds } },
							{ pdf_ingestion_job_id: { in: jobIds } },
						],
					},
				})

				// Mark schemes
				await tx.markScheme.deleteMany({
					where: { question_id: { in: questionIds } },
				})

				// Question bank membership
				await tx.questionBankItem.deleteMany({
					where: { question_id: { in: questionIds } },
				})

				// Marking results and extracted answers for answers
				await tx.markingResult.deleteMany({
					where: { answer_id: { in: answerIds } },
				})
				await tx.answer.deleteMany({
					where: { question_id: { in: questionIds } },
				})

				// Exam section questions, then sections
				await tx.examSectionQuestion.deleteMany({
					where: { exam_section_id: { in: sectionIds } },
				})
				await tx.examSection.deleteMany({ where: { exam_paper_id: id } })

				// Questions that originated from this paper's ingestion jobs
				await tx.question.deleteMany({
					where: { source_pdf_ingestion_job_id: { in: jobIds } },
				})

				// PDF ingestion jobs
				await tx.pdfIngestionJob.deleteMany({ where: { exam_paper_id: id } })

				// Finally the paper itself
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

// ─── Delete Question ──────────────────────────────────────────────────────────

export type DeleteQuestionResult = { ok: true } | { ok: false; error: string }

/**
 * Fully deletes a question and all associated data in a transaction.
 *
 * Cascade order (child-first to avoid FK violations):
 *  1. MarkSchemeTestRun → MarkScheme
 *  2. ExemplarAnswer linked to question or its mark schemes
 *  3. MarkScheme
 *  4. QuestionBankItem
 *  5. MarkingResult → Answer
 *  6. ExamSectionQuestion
 *  7. Question
 */
export async function deleteQuestion(
	questionId: string,
): Promise<DeleteQuestionResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	log.info(TAG, "deleteQuestion called", { userId: session.userId, questionId })

	try {
		await db.$transaction(async (tx) => {
			const markSchemes = await tx.markScheme.findMany({
				where: { question_id: questionId },
				select: { id: true },
			})
			const markSchemeIds = markSchemes.map((ms) => ms.id)

			const answers = await tx.answer.findMany({
				where: { question_id: questionId },
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
						{ question_id: questionId },
					],
				},
			})

			await tx.markScheme.deleteMany({
				where: { question_id: questionId },
			})

			await tx.questionBankItem.deleteMany({
				where: { question_id: questionId },
			})

			await tx.markingResult.deleteMany({
				where: { answer_id: { in: answerIds } },
			})

			await tx.answer.deleteMany({
				where: { question_id: questionId },
			})

			await tx.examSectionQuestion.deleteMany({
				where: { question_id: questionId },
			})

			await tx.question.delete({ where: { id: questionId } })
		})

		log.info(TAG, "Question deleted", { userId: session.userId, questionId })
		return { ok: true }
	} catch (err) {
		log.error(TAG, "deleteQuestion failed", {
			userId: session.userId,
			questionId,
			error: String(err),
		})
		return { ok: false, error: "Failed to delete question" }
	}
}

// ─── Reorder ──────────────────────────────────────────────────────────────────

export type ReorderResult = { ok: true } | { ok: false; error: string }

export async function reorderQuestionsInSection(
	sectionId: string,
	orderedQuestionIds: string[],
): Promise<ReorderResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	try {
		await db.$transaction(
			orderedQuestionIds.map((questionId, index) =>
				db.examSectionQuestion.update({
					where: {
						exam_section_id_question_id: {
							exam_section_id: sectionId,
							question_id: questionId,
						},
					},
					data: { order: index + 1 },
				}),
			),
		)
		return { ok: true }
	} catch {
		return { ok: false, error: "Failed to reorder questions" }
	}
}

export async function reorderSections(
	examPaperId: string,
	orderedSectionIds: string[],
): Promise<ReorderResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	try {
		await db.$transaction(
			orderedSectionIds.map((sectionId, index) =>
				db.examSection.update({
					where: { id: sectionId },
					data: { order: index + 1 },
				}),
			),
		)
		return { ok: true }
	} catch {
		return { ok: false, error: "Failed to reorder sections" }
	}
}

// ─── Orphaned (Unlinked) Mark Schemes ─────────────────────────────────────────

export type UnlinkedMarkScheme = {
	markSchemeId: string
	markSchemeDescription: string | null
	pointsTotal: number
	ghostQuestionId: string
	ghostQuestionText: string
	ghostQuestionNumber: string | null
}

export type GetUnlinkedMarkSchemesResult =
	| { ok: true; items: UnlinkedMarkScheme[] }
	| { ok: false; error: string }

/**
 * Returns questions in the paper whose mark scheme has link_status = "unlinked".
 * These are "ghost" questions created by the ingestion pipeline that couldn't
 * be matched to an existing question paper question.
 */
export async function getUnlinkedMarkSchemes(
	examPaperId: string,
): Promise<GetUnlinkedMarkSchemesResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	try {
		const rows = await db.examSectionQuestion.findMany({
			where: {
				exam_section: { exam_paper_id: examPaperId },
				question: {
					mark_schemes: { some: { link_status: "unlinked" } },
				},
			},
			select: {
				question: {
					select: {
						id: true,
						text: true,
						question_number: true,
						mark_schemes: {
							where: { link_status: "unlinked" },
							select: {
								id: true,
								description: true,
								points_total: true,
							},
						},
					},
				},
			},
		})

		const items: UnlinkedMarkScheme[] = []
		for (const row of rows) {
			for (const ms of row.question.mark_schemes) {
				items.push({
					markSchemeId: ms.id,
					markSchemeDescription: ms.description,
					pointsTotal: ms.points_total,
					ghostQuestionId: row.question.id,
					ghostQuestionText: row.question.text,
					ghostQuestionNumber: row.question.question_number,
				})
			}
		}

		return { ok: true, items }
	} catch (err) {
		log.error(TAG, "getUnlinkedMarkSchemes failed", {
			examPaperId,
			error: String(err),
		})
		return { ok: false, error: "Failed to load unlinked mark schemes" }
	}
}

export type LinkMarkSchemeToQuestionResult =
	| { ok: true }
	| { ok: false; error: string }

/**
 * Re-parents an unlinked mark scheme onto the chosen target question,
 * then cleans up the ghost question that was holding it.
 */
export async function linkMarkSchemeToQuestion(
	ghostQuestionId: string,
	targetQuestionId: string,
): Promise<LinkMarkSchemeToQuestionResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	if (ghostQuestionId === targetQuestionId) {
		return { ok: false, error: "Ghost and target question cannot be the same" }
	}

	log.info(TAG, "linkMarkSchemeToQuestion called", {
		userId: session.userId,
		ghostQuestionId,
		targetQuestionId,
	})

	try {
		await db.$transaction(async (tx) => {
			await tx.markScheme.updateMany({
				where: { question_id: ghostQuestionId, link_status: "unlinked" },
				data: { question_id: targetQuestionId, link_status: "linked" },
			})

			await tx.examSectionQuestion.deleteMany({
				where: { question_id: ghostQuestionId },
			})

			await tx.question.delete({ where: { id: ghostQuestionId } })
		})

		log.info(TAG, "Mark scheme linked to question", {
			userId: session.userId,
			ghostQuestionId,
			targetQuestionId,
		})

		return { ok: true }
	} catch (err) {
		log.error(TAG, "linkMarkSchemeToQuestion failed", {
			userId: session.userId,
			ghostQuestionId,
			targetQuestionId,
			error: String(err),
		})
		return { ok: false, error: "Failed to link mark scheme" }
	}
}

// ─── Question Detail ──────────────────────────────────────────────────────────

export type QuestionMarkScheme = {
	id: string
	description: string | null
	guidance: string | null
	points_total: number
	marking_method: string
	mark_points: unknown
	marking_rules: unknown
	link_status: string
	correct_option_labels: string[]
}

export type MultipleChoiceOption = {
	option_label: string
	option_text: string
}

export type QuestionDetail = {
	id: string
	text: string
	question_type: string
	origin: string
	topic: string
	subject: string
	points: number | null
	question_number: string | null
	created_at: Date
	source_pdf_ingestion_job_id: string | null
	multiple_choice_options: MultipleChoiceOption[]
	mark_schemes: QuestionMarkScheme[]
}

export type GetQuestionDetailResult =
	| { ok: true; question: QuestionDetail }
	| { ok: false; error: string }

export async function getQuestionDetail(
	questionId: string,
): Promise<GetQuestionDetailResult> {
	try {
		const question = await db.question.findUnique({
			where: { id: questionId },
			select: {
				id: true,
				text: true,
				question_type: true,
				origin: true,
				topic: true,
				subject: true,
				points: true,
				created_at: true,
				source_pdf_ingestion_job_id: true,
				question_number: true,
				multiple_choice_options: true,
				mark_schemes: {
					orderBy: { created_at: "asc" },
					select: {
						id: true,
						description: true,
						guidance: true,
						points_total: true,
						marking_method: true,
						mark_points: true,
						marking_rules: true,
						link_status: true,
						correct_option_labels: true,
					},
				},
			},
		})
		if (!question) return { ok: false, error: "Question not found" }

		const rawOptions = Array.isArray(question.multiple_choice_options)
			? (question.multiple_choice_options as MultipleChoiceOption[])
			: []

		return {
			ok: true,
			question: {
				id: question.id,
				text: question.text,
				question_type: question.question_type,
				origin: question.origin,
				topic: question.topic,
				subject: question.subject,
				points: question.points,
				created_at: question.created_at,
				source_pdf_ingestion_job_id: question.source_pdf_ingestion_job_id,
				question_number: question.question_number,
				multiple_choice_options: rawOptions,
				mark_schemes: question.mark_schemes.map((ms) => ({
					id: ms.id,
					// Normalize the string "null" that Gemini sometimes writes into the description field
					description:
						ms.description === "null" || !ms.description
							? null
							: ms.description,
					guidance: ms.guidance,
					points_total: ms.points_total,
					marking_method: ms.marking_method,
					mark_points: ms.mark_points,
					marking_rules: ms.marking_rules,
					link_status: ms.link_status,
					correct_option_labels: ms.correct_option_labels,
				})),
			},
		}
	} catch {
		return { ok: false, error: "Failed to load question" }
	}
}

export type UpdateQuestionInput = {
	text?: string
	points?: number | null
	question_number?: string | null
}

export type UpdateQuestionResult =
	| { ok: true; embeddingUpdated: boolean }
	| { ok: false; error: string }

/**
 * Updates question text and/or marks. When text changes, regenerates the
 * embedding via Gemini so semantic search and mark-scheme matching stay accurate.
 */
export async function updateQuestion(
	questionId: string,
	input: UpdateQuestionInput,
): Promise<UpdateQuestionResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const trimmedText = input.text?.trim()
	if (trimmedText !== undefined && trimmedText === "") {
		return { ok: false, error: "Question text cannot be empty" }
	}

	log.info(TAG, "updateQuestion called", {
		userId: session.userId,
		questionId,
		hasText: trimmedText !== undefined,
		hasPoints: input.points !== undefined,
	})

	try {
		const existing = await db.question.findUnique({
			where: { id: questionId },
			select: { text: true },
		})
		if (!existing) return { ok: false, error: "Question not found" }

		const textChanged =
			trimmedText !== undefined && trimmedText !== existing.text

		await db.question.update({
			where: { id: questionId },
			data: {
				...(trimmedText !== undefined ? { text: trimmedText } : {}),
				...(input.points !== undefined ? { points: input.points } : {}),
				...(input.question_number !== undefined
					? { question_number: input.question_number || null }
					: {}),
			},
		})

		let embeddingUpdated = false

		if (textChanged && trimmedText) {
			const gemini = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })
			const result = await gemini.models.embedContent({
				model: "gemini-embedding-001",
				contents: trimmedText,
				config: {
					outputDimensionality: EMBEDDING_DIMENSIONS,
					taskType: "SEMANTIC_SIMILARITY",
				},
			})

			const values = result.embeddings?.[0]?.values
			if (values && values.length === EMBEDDING_DIMENSIONS) {
				const vecStr = `[${values.join(",")}]`
				await db.$executeRaw`
					UPDATE questions SET embedding = (${vecStr}::text)::vector WHERE id = ${questionId}
				`
				embeddingUpdated = true
				log.info(TAG, "Embedding regenerated", { questionId })
			}
		}

		log.info(TAG, "Question updated", {
			userId: session.userId,
			questionId,
			textChanged,
			embeddingUpdated,
		})

		return { ok: true, embeddingUpdated }
	} catch (err) {
		log.error(TAG, "updateQuestion failed", {
			userId: session.userId,
			questionId,
			error: String(err),
		})
		return { ok: false, error: "Failed to update question" }
	}
}

// ─── Similarity + Duplicate Detection ────────────────────────────────────────

export type SimilarPair = {
	questionId: string
	similarToId: string
	distance: number
}

export type GetSimilarQuestionsForPaperResult =
	| { ok: true; pairs: SimilarPair[] }
	| { ok: false; error: string }

/**
 * For each question in the paper, finds the nearest neighbour within the same
 * paper using vector cosine similarity. Returns pairs with distance < 0.15
 * (tighter than the matching threshold to avoid false positives).
 *
 * Deduplicates symmetric pairs (A,B) == (B,A) so each pair appears once.
 */
export async function getSimilarQuestionsForPaper(
	examPaperId: string,
): Promise<GetSimilarQuestionsForPaperResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	try {
		// Fetch all questions in the paper that have embeddings
		const rows = await db.$queryRaw<{ id: string; embedding: string | null }[]>`
			SELECT q.id, q.embedding::text AS embedding
			FROM questions q
			JOIN exam_section_questions esq ON esq.question_id = q.id
			JOIN exam_sections es ON es.id = esq.exam_section_id
			WHERE es.exam_paper_id = ${examPaperId}
			AND q.embedding IS NOT NULL
		`

		if (rows.length < 2) return { ok: true, pairs: [] }

		const seen = new Set<string>()
		const pairs: SimilarPair[] = []

		await Promise.all(
			rows.map(async (row) => {
				const nearRows = await db.$queryRaw<{ id: string; dist: number }[]>`
					SELECT q.id, (q.embedding <=> (SELECT embedding FROM questions WHERE id = ${row.id})) AS dist
					FROM questions q
					JOIN exam_section_questions esq ON esq.question_id = q.id
					JOIN exam_sections es ON es.id = esq.exam_section_id
					WHERE es.exam_paper_id = ${examPaperId}
					AND q.id != ${row.id}
					AND q.embedding IS NOT NULL
					ORDER BY dist ASC
					LIMIT 1
				`
				const near = nearRows[0]
				if (!near || Number(near.dist) >= 0.15) return

				const key = [row.id, near.id].sort().join(":")
				if (seen.has(key)) return
				seen.add(key)
				pairs.push({
					questionId: row.id,
					similarToId: near.id,
					distance: Number(near.dist),
				})
			}),
		)

		return { ok: true, pairs }
	} catch (err) {
		log.error(TAG, "getSimilarQuestionsForPaper failed", {
			examPaperId,
			error: String(err),
		})
		return { ok: false, error: "Failed to compute similarity" }
	}
}

// ─── Consolidate (merge) duplicate questions ──────────────────────────────────

export type ConsolidateQuestionsResult =
	| { ok: true }
	| { ok: false; error: string }

/**
 * Merges two duplicate questions into one:
 * 1. Optionally updates the kept question's text (and regenerates its embedding).
 * 2. Optionally deletes a specific mark scheme from the discarded question instead
 *    of moving it (used when both questions have a mark scheme and the user picks
 *    which to keep).
 * 3. Moves remaining mark schemes from `discardId` onto `keepId`.
 * 4. Removes `discardId` from all exam section question lists.
 * 5. Deletes the `discardId` question.
 *
 * Runs in a transaction to avoid partial state.
 */
export async function consolidateQuestions(
	keepQuestionId: string,
	discardQuestionId: string,
	opts?: {
		/** Override the kept question's text (e.g. user preferred the discard's wording) */
		overrideText?: string
		/** Mark scheme ID on the discard question to delete rather than move */
		discardMarkSchemeId?: string
	},
): Promise<ConsolidateQuestionsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	if (keepQuestionId === discardQuestionId) {
		return { ok: false, error: "Cannot consolidate a question with itself" }
	}

	log.info(TAG, "consolidateQuestions called", {
		userId: session.userId,
		keepQuestionId,
		discardQuestionId,
		hasOverrideText: !!opts?.overrideText,
		discardMarkSchemeId: opts?.discardMarkSchemeId ?? null,
	})

	try {
		await db.$transaction(async (tx) => {
			// Optionally update the kept question's text
			if (opts?.overrideText) {
				await tx.question.update({
					where: { id: keepQuestionId },
					data: { text: opts.overrideText },
				})
			}

			// Optionally delete the chosen discard mark scheme (and its children)
			if (opts?.discardMarkSchemeId) {
				await tx.markSchemeTestRun.deleteMany({
					where: { mark_scheme_id: opts.discardMarkSchemeId },
				})
				await tx.exemplarAnswer.deleteMany({
					where: { mark_scheme_id: opts.discardMarkSchemeId },
				})
				await tx.markScheme.delete({
					where: { id: opts.discardMarkSchemeId },
				})
			}

			// Move remaining mark schemes from discard onto keep
			await tx.markScheme.updateMany({
				where: { question_id: discardQuestionId },
				data: { question_id: keepQuestionId, link_status: "auto_linked" },
			})

			// Remove from exam sections
			await tx.examSectionQuestion.deleteMany({
				where: { question_id: discardQuestionId },
			})

			// Delete the duplicate question
			await tx.question.delete({
				where: { id: discardQuestionId },
			})
		})

		// Regenerate embedding if text was overridden (outside transaction — best effort)
		if (opts?.overrideText) {
			try {
				const gemini = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })
				const result = await gemini.models.embedContent({
					model: "gemini-embedding-001",
					contents: opts.overrideText,
					config: {
						outputDimensionality: EMBEDDING_DIMENSIONS,
						taskType: "SEMANTIC_SIMILARITY",
					},
				})
				const values = result.embeddings?.[0]?.values
				if (values && values.length === EMBEDDING_DIMENSIONS) {
					const vecStr = `[${values.join(",")}]`
					await db.$executeRaw`
						UPDATE questions SET embedding = (${vecStr}::text)::vector WHERE id = ${keepQuestionId}
					`
					log.info(TAG, "Embedding regenerated after merge", { keepQuestionId })
				}
			} catch (embErr) {
				log.error(TAG, "Failed to regenerate embedding after merge", {
					keepQuestionId,
					error: String(embErr),
				})
			}
		}

		log.info(TAG, "Questions consolidated", {
			userId: session.userId,
			keepQuestionId,
			discardQuestionId,
		})

		return { ok: true }
	} catch (err) {
		log.error(TAG, "consolidateQuestions failed", {
			userId: session.userId,
			keepQuestionId,
			discardQuestionId,
			error: String(err),
		})
		return { ok: false, error: "Failed to consolidate questions" }
	}
}

// ---------------------------------------------------------------------------
// Manual mark scheme create / update
// ---------------------------------------------------------------------------

export type MarkSchemePointInput = {
	description: string
	points: number
}

export type MarkingRulesLevelInput = {
	level: number
	mark_range: [number, number]
	descriptor: string
	ao_requirements?: string[]
}

export type MarkingRulesCapInput = {
	condition: string
	max_level?: number
	max_mark?: number
	reason: string
}

export type MarkingRulesInput = {
	command_word?: string
	items_required?: number
	levels: MarkingRulesLevelInput[]
	caps?: MarkingRulesCapInput[]
}

export type MarkSchemeInput =
	| {
			marking_method: "point_based"
			description: string
			guidance?: string | null
			mark_points: MarkSchemePointInput[]
	  }
	| {
			marking_method: "deterministic"
			description: string
			guidance?: string | null
			correct_option_labels: string[]
	  }
	| {
			marking_method: "level_of_response"
			description: string
			guidance?: string | null
			marking_rules: MarkingRulesInput
	  }

export type CreateMarkSchemeResult =
	| { ok: true; id: string }
	| { ok: false; error: string }

export async function createMarkScheme(
	questionId: string,
	input: MarkSchemeInput,
): Promise<CreateMarkSchemeResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const description = input.description.trim()
	if (!description) return { ok: false, error: "Description is required" }

	if (
		input.marking_method === "deterministic" &&
		input.correct_option_labels.length === 0
	) {
		return { ok: false, error: "Select at least one correct answer" }
	}
	if (
		input.marking_method === "level_of_response" &&
		input.marking_rules.levels.length === 0
	) {
		return { ok: false, error: "At least one level descriptor is required" }
	}

	const isDeterministic = input.marking_method === "deterministic"
	const isPointBased = input.marking_method === "point_based"
	const isLevelOfResponse = input.marking_method === "level_of_response"
	const pointsTotal = isDeterministic
		? 1
		: isPointBased
			? input.mark_points.reduce((sum, mp) => sum + mp.points, 0)
			: Math.max(...input.marking_rules.levels.map((l) => l.mark_range[1]))
	const markPoints = isPointBased
		? input.mark_points.map((mp, i) => ({
				point_number: i + 1,
				description: mp.description,
				points: mp.points,
			}))
		: []
	const correctOptionLabels = isDeterministic ? input.correct_option_labels : []

	try {
		const ms = await db.markScheme.create({
			data: {
				question_id: questionId,
				description,
				guidance: input.guidance?.trim() || null,
				points_total: pointsTotal,
				mark_points: markPoints,
				marking_method: input.marking_method,
				...(isLevelOfResponse ? { marking_rules: input.marking_rules } : {}),
				correct_option_labels: correctOptionLabels,
				link_status: "linked",
				created_by_id: session.userId,
			},
			select: { id: true },
		})

		log.info(TAG, "Mark scheme created manually", {
			userId: session.userId,
			questionId,
			markSchemeId: ms.id,
			markingMethod: input.marking_method,
		})

		return { ok: true, id: ms.id }
	} catch (err) {
		log.error(TAG, "createMarkScheme failed", {
			userId: session.userId,
			questionId,
			error: String(err),
		})
		return { ok: false, error: "Failed to create mark scheme" }
	}
}

export type UpdateMarkSchemeResult = { ok: true } | { ok: false; error: string }

export async function updateMarkScheme(
	markSchemeId: string,
	input: MarkSchemeInput,
): Promise<UpdateMarkSchemeResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const description = input.description.trim()
	if (!description) return { ok: false, error: "Description is required" }

	try {
		const existing = await db.markScheme.findUnique({
			where: { id: markSchemeId },
			select: { marking_method: true },
		})
		if (!existing) return { ok: false, error: "Mark scheme not found" }

		const isDeterministic = existing.marking_method === "deterministic"
		const isPointBased = existing.marking_method === "point_based"
		const isLevelOfResponse = existing.marking_method === "level_of_response"

		if (isDeterministic && input.marking_method !== "deterministic") {
			return { ok: false, error: "Invalid update payload for mark scheme type" }
		}
		if (isPointBased && input.marking_method !== "point_based") {
			return { ok: false, error: "Invalid update payload for mark scheme type" }
		}
		if (isLevelOfResponse && input.marking_method !== "level_of_response") {
			return { ok: false, error: "Invalid update payload for mark scheme type" }
		}
		if (
			isDeterministic &&
			input.marking_method === "deterministic" &&
			input.correct_option_labels.length === 0
		) {
			return { ok: false, error: "Select at least one correct answer" }
		}
		if (
			isLevelOfResponse &&
			input.marking_method === "level_of_response" &&
			input.marking_rules.levels.length === 0
		) {
			return { ok: false, error: "At least one level descriptor is required" }
		}

		const pointsTotal = isPointBased
			? input.marking_method === "point_based"
				? input.mark_points.reduce((sum, mp) => sum + mp.points, 0)
				: 0
			: isLevelOfResponse && input.marking_method === "level_of_response"
				? Math.max(...input.marking_rules.levels.map((l) => l.mark_range[1]))
				: null
		const markPoints =
			isPointBased && input.marking_method === "point_based"
				? input.mark_points.map((mp, i) => ({
						point_number: i + 1,
						description: mp.description,
						points: mp.points,
					}))
				: null

		await db.markScheme.update({
			where: { id: markSchemeId },
			data: {
				description,
				guidance: input.guidance?.trim() || null,
				...(isPointBased && pointsTotal !== null && markPoints !== null
					? {
							points_total: pointsTotal,
							mark_points: markPoints,
						}
					: {}),
				...(isLevelOfResponse &&
				input.marking_method === "level_of_response" &&
				pointsTotal !== null
					? {
							points_total: pointsTotal,
							marking_rules: input.marking_rules,
						}
					: {}),
				...(isDeterministic && input.marking_method === "deterministic"
					? { correct_option_labels: input.correct_option_labels }
					: {}),
			},
		})

		log.info(TAG, "Mark scheme updated manually", {
			userId: session.userId,
			markSchemeId,
			markingMethod: existing.marking_method,
		})

		return { ok: true }
	} catch (err) {
		log.error(TAG, "updateMarkScheme failed", {
			userId: session.userId,
			markSchemeId,
			error: String(err),
		})
		return { ok: false, error: "Failed to update mark scheme" }
	}
}

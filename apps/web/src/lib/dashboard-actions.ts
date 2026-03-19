"use server"

import { createPrismaClient } from "@mcp-gcse/db"
import type { Subject } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "./auth"
import { log } from "./logger"

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
	totalScanSubmissions: number
	pendingScanSubmissions: number
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

export type RecentScanSubmission = {
	id: string
	studentName: string | null
	studentEmail: string | null
	status: string
	pageCount: number
	uploadedAt: Date
	processedAt: Date | null
	errorMessage: string | null
}

export type DashboardData = {
	stats: DashboardStats
	markingStatusBreakdown: MarkingStatusBreakdown[]
	questionsBySubject: QuestionsBySubject[]
	usersByRole: UsersByRole[]
	recentScanSubmissions: RecentScanSubmission[]
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
		scan_submissions: number
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
						scan_submissions: true,
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
		totalScanSubmissions,
		pendingScanSubmissions,
		markSchemesNeedingReview,
		answersByStatus,
		questionsBySubjectRaw,
		usersByRoleRaw,
		recentScansRaw,
	] = await Promise.all([
		db.user.count(),
		db.question.count(),
		db.examPaper.count({ where: { is_active: true } }),
		db.questionBank.count({ where: { is_active: true } }),
		db.answer.count({ where: { marking_status: "pending" } }),
		db.answer.count({ where: { marking_status: "completed" } }),
		db.answer.count({ where: { marking_status: "failed" } }),
		db.scanSubmission.count(),
		db.scanSubmission.count({ where: { status: "pending" } }),
		db.markScheme.count({
			where: { link_status: { in: ["unlinked", "auto_linked"] } },
		}),
		db.answer.groupBy({ by: ["marking_status"], _count: { id: true } }),
		db.question.groupBy({ by: ["subject"], _count: { id: true } }),
		db.user.groupBy({ by: ["role"], _count: { id: true } }),
		db.scanSubmission.findMany({
			take: 10,
			orderBy: { uploaded_at: "desc" },
			include: {
				student: { select: { name: true, email: true } },
			},
		}),
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
			totalScanSubmissions,
			pendingScanSubmissions,
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
		recentScanSubmissions: recentScansRaw.map((s) => ({
			id: s.id,
			studentName: s.student.name,
			studentEmail: s.student.email,
			status: s.status,
			pageCount: s.page_count,
			uploadedAt: s.uploaded_at,
			processedAt: s.processed_at,
			errorMessage: s.error_message,
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
	order: number
	section_title: string
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
										mark_schemes: {
											select: { id: true, link_status: true },
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

		const questions: ExamPaperQuestion[] = []
		for (const section of paper.sections) {
			for (const esq of section.exam_section_questions) {
				const ms = esq.question.mark_schemes[0]
				questions.push({
					id: esq.question.id,
					text: esq.question.text,
					question_type: esq.question.question_type,
					points: esq.question.points,
					origin: esq.question.origin,
					mark_scheme_count: esq.question.mark_schemes.length,
					mark_scheme_status: ms?.link_status ?? null,
					order: esq.order,
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

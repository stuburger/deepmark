"use server"

import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"

const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

// ─── Dashboard ────────────────────────────────────────────────────────────────

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

// ─── Questions list ───────────────────────────────────────────────────────────

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

// ─── Exemplars list ───────────────────────────────────────────────────────────

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

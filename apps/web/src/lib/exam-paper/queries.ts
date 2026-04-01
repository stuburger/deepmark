"use server"

import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../auth"
import { log } from "../logger"

const TAG = "exam-paper/queries"
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

// ─── Exam paper list ──────────────────────────────────────────────────────────

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

// ─── Exam paper detail ────────────────────────────────────────────────────────

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
	mark_scheme_correct_option_labels: string[]
	mark_scheme_points_total: number | null
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
												correct_option_labels: true,
												points_total: true,
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
					mark_scheme_correct_option_labels: ms?.correct_option_labels ?? [],
					mark_scheme_points_total: ms?.points_total ?? null,
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

// ─── Public catalog ───────────────────────────────────────────────────────────

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

// ─── Unlinked mark schemes ────────────────────────────────────────────────────

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

// ─── Similarity ───────────────────────────────────────────────────────────────

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

"use server"

import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import type {
	CatalogExamPaper,
	ExamPaperDetail,
	ExamPaperListItem,
} from "../types"

const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

// ─── Exam paper list ──────────────────────────────────────────────────────────

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
				sections: paper.sections.map((section) => ({
					id: section.id,
					title: section.title,
					questions: section.exam_section_questions.map((esq) => {
						const ms = esq.question.mark_schemes[0]
						const mcqOptions = Array.isArray(
							esq.question.multiple_choice_options,
						)
							? (esq.question.multiple_choice_options as {
									option_label: string
									option_text: string
								}[])
							: []
						return {
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
							mark_scheme_correct_option_labels:
								ms?.correct_option_labels ?? [],
							mark_scheme_points_total: ms?.points_total ?? null,
							order: esq.order,
						}
					}),
				})),
				section_count: paper.sections.length,
				level_descriptors: paper.level_descriptors ?? null,
			},
		}
	} catch {
		return { ok: false, error: "Failed to load exam paper" }
	}
}

// ─── Public catalog ───────────────────────────────────────────────────────────

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

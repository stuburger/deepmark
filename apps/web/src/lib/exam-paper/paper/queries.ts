"use server"

import { publicAction, resourceAction, scopedAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { type GradeBoundary, gradeBoundariesSchema } from "@mcp-gcse/shared"
import { z } from "zod"
import type {
	CatalogExamPaper,
	ExamPaperDetail,
	ExamPaperListItem,
} from "../types"

function parseStoredBoundaries(raw: unknown): GradeBoundary[] | null {
	if (raw === null || raw === undefined) return null
	const result = gradeBoundariesSchema.safeParse(raw)
	return result.success ? result.data : null
}

// ─── Exam paper list ──────────────────────────────────────────────────────────

export const listExamPapers = scopedAction({
	scope: "examPaper",
	role: "viewer",
}).action(async ({ ctx }): Promise<{ papers: ExamPaperListItem[] }> => {
	const papers = await db.examPaper.findMany({
		where: ctx.accessWhere,
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
			created_at: true,
			_count: {
				select: {
					sections: true,
					pdf_ingestion_jobs: true,
				},
			},
		},
	})
	return { papers }
})

// ─── Exam paper detail ────────────────────────────────────────────────────────

export const getExamPaperDetail = resourceAction({
	type: "examPaper",
	role: "viewer",
	schema: z.object({ id: z.string() }),
	id: ({ id }) => id,
}).action(
	async ({
		parsedInput: { id },
	}): Promise<{ paper: ExamPaperDetail | null }> => {
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
										extraction_warning: true,
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
										question_stimuli: {
											orderBy: { order: "asc" },
											select: {
												stimulus: {
													select: {
														id: true,
														label: true,
														content: true,
														content_type: true,
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		})
		if (!paper) return { paper: null }

		return {
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
							extraction_warning: esq.question.extraction_warning,
							multiple_choice_options: mcqOptions,
							mark_scheme_count: esq.question.mark_schemes.length,
							mark_scheme_status: ms?.link_status ?? null,
							mark_scheme_id: ms?.id ?? null,
							mark_scheme_description: ms?.description ?? null,
							mark_scheme_correct_option_labels:
								ms?.correct_option_labels ?? [],
							mark_scheme_points_total: ms?.points_total ?? null,
							stimuli: esq.question.question_stimuli.map((qs) => ({
								id: qs.stimulus.id,
								label: qs.stimulus.label,
								content: qs.stimulus.content,
								content_type: qs.stimulus.content_type,
							})),
							order: esq.order,
						}
					}),
				})),
				section_count: paper.sections.length,
				level_descriptors: paper.level_descriptors ?? null,
				tier: paper.tier ?? null,
				grade_boundaries: parseStoredBoundaries(paper.grade_boundaries),
				grade_boundary_mode: paper.grade_boundary_mode ?? null,
			},
		}
	},
)

// ─── Public catalog ───────────────────────────────────────────────────────────

export const listCatalogExamPapers = publicAction.action(
	async (): Promise<{ papers: CatalogExamPaper[] }> => {
		const papers = await db.examPaper.findMany({
			where: { is_active: true },
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
	},
)

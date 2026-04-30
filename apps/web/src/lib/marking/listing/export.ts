"use server"

import { resourceAction } from "@/lib/authz"
import { db } from "@/lib/db"
import {
	type BoundaryMode,
	type GradeBoundary,
	gradeBoundariesSchema,
} from "@mcp-gcse/shared"
import { z } from "zod"
import { sumSectionPoints } from "../paper-totals"
import type { GradingResult } from "../types"

export type SubmissionExportQuestion = {
	question_id: string
	question_number: string
	max_score: number
	order: number
}

export type SubmissionExportRow = {
	submission_id: string
	student_name: string | null
	total_awarded: number
	total_max: number
	date_marked: Date
	rescans: number
	per_question: Record<string, number | null>
}

export type SubmissionExportPayload = {
	paper_title: string
	subject: string
	tier: "foundation" | "higher" | null
	grade_boundaries: GradeBoundary[] | null
	grade_boundary_mode: BoundaryMode | null
	questions: SubmissionExportQuestion[]
	rows: SubmissionExportRow[]
}

/**
 * Builds a row-per-student export for the submissions tab. Only includes
 * non-superseded submissions with a terminal grading run — in-progress or
 * failed runs are excluded. Uses the latest grading run per submission.
 */
export const exportSubmissionsForPaper = resourceAction({
	type: "examPaper",
	role: "viewer",
	schema: z.object({
		examPaperId: z.string(),
		submissionIds: z.array(z.string()).optional(),
	}),
	id: ({ examPaperId }) => examPaperId,
}).action(
	async ({
		parsedInput: { examPaperId, submissionIds },
	}): Promise<{ data: SubmissionExportPayload }> => {
		if (submissionIds && submissionIds.length === 0) {
			throw new Error("No submissions selected")
		}

		const paper = await db.examPaper.findUnique({
			where: { id: examPaperId },
			select: {
				title: true,
				subject: true,
				tier: true,
				grade_boundaries: true,
				grade_boundary_mode: true,
				sections: {
					orderBy: { order: "asc" },
					select: {
						exam_paper_id: true,
						exam_section_questions: {
							orderBy: { order: "asc" },
							select: {
								question: {
									select: {
										id: true,
										question_number: true,
										points: true,
									},
								},
							},
						},
					},
				},
			},
		})
		if (!paper) throw new Error("Exam paper not found")

		const questions: SubmissionExportQuestion[] = []
		let order = 0
		for (const section of paper.sections) {
			for (const esq of section.exam_section_questions) {
				const q = esq.question
				questions.push({
					question_id: q.id,
					question_number: q.question_number ?? String(order + 1),
					max_score: q.points ?? 0,
					order: order++,
				})
			}
		}

		const paperTotal = paper.sections.reduce(
			(sum, s) => sum + sumSectionPoints(s),
			0,
		)

		const submissions = await db.studentSubmission.findMany({
			where: {
				exam_paper_id: examPaperId,
				superseded_at: null,
				...(submissionIds ? { id: { in: submissionIds } } : {}),
			},
			orderBy: { created_at: "desc" },
			select: {
				id: true,
				student_name: true,
				created_at: true,
				s3_key: true,
				grading_runs: {
					orderBy: { created_at: "desc" },
					take: 1,
					select: { status: true, grading_results: true },
				},
				teacher_overrides: {
					select: { question_id: true, score_override: true },
				},
			},
		})

		const versionCounts = await db.studentSubmission.groupBy({
			by: ["s3_key"],
			where: { exam_paper_id: examPaperId },
			_count: true,
		})
		const countByKey = new Map(versionCounts.map((v) => [v.s3_key, v._count]))

		const rows: SubmissionExportRow[] = []
		for (const sub of submissions) {
			const latest = sub.grading_runs[0]
			if (!latest || latest.status !== "complete") continue

			const results = (latest.grading_results ?? []) as GradingResult[]
			const overrideByQuestion = new Map(
				sub.teacher_overrides.map((o) => [o.question_id, o.score_override]),
			)

			const perQuestion: Record<string, number | null> = {}
			for (const q of questions) perQuestion[q.question_id] = null
			let totalAwarded = 0
			for (const r of results) {
				const override = overrideByQuestion.get(r.question_id)
				const score = override ?? r.awarded_score
				perQuestion[r.question_id] = score
				totalAwarded += score
			}

			rows.push({
				submission_id: sub.id,
				student_name: sub.student_name,
				total_awarded: totalAwarded,
				total_max: paperTotal,
				date_marked: sub.created_at,
				rescans: countByKey.get(sub.s3_key) ?? 1,
				per_question: perQuestion,
			})
		}

		const boundariesResult = paper.grade_boundaries
			? gradeBoundariesSchema.safeParse(paper.grade_boundaries)
			: null
		const boundaries = boundariesResult?.success ? boundariesResult.data : null

		return {
			data: {
				paper_title: paper.title,
				subject: paper.subject,
				tier: paper.tier ?? null,
				grade_boundaries: boundaries,
				grade_boundary_mode: paper.grade_boundary_mode ?? null,
				questions,
				rows,
			},
		}
	},
)

"use server"

import { scopedAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { z } from "zod"
import type { ExamPaperStats, GradingResult } from "../types"

/**
 * Stats are scoped to the current user's accessible submissions: a teacher
 * with `viewer` on the paper sees stats across submissions they can read.
 * `scopedAction` wires the where-clause; we then narrow to this paper.
 */
export const getExamPaperStats = scopedAction({
	scope: "submission",
	role: "viewer",
})
	.inputSchema(z.object({ examPaperId: z.string() }))
	.action(
		async ({
			parsedInput: { examPaperId },
			ctx,
		}): Promise<{ stats: ExamPaperStats }> => {
			// Paper access is asserted by reading paper-bound resources via the
			// per-resource asserter — re-use the resource asserter to keep the
			// paper-level "viewer" check explicit rather than relying solely on
			// the submission-where filter.
			const { assertExamPaperAccess } = await import("@/lib/authz")
			const access = await assertExamPaperAccess(
				ctx.user,
				examPaperId,
				"viewer",
			)
			if (!access.ok) throw new Error(access.error)

			const subs = await db.studentSubmission.findMany({
				where: {
					exam_paper_id: examPaperId,
					superseded_at: null,
					...ctx.accessWhere,
					grading_runs: {
						some: { status: "complete" },
					},
				},
				include: {
					exam_paper: { select: { title: true } },
					grading_runs: {
						where: { status: "complete" },
						orderBy: { created_at: "desc" },
						take: 1,
						select: { grading_results: true },
					},
				},
			})

			if (subs.length === 0) {
				const paper = await db.examPaper.findUnique({
					where: { id: examPaperId },
					select: { title: true },
				})
				return {
					stats: {
						exam_paper_id: examPaperId,
						exam_paper_title: paper?.title ?? "Unknown",
						submission_count: 0,
						avg_total_percent: 0,
						question_stats: [],
					},
				}
			}

			const allResults = subs.flatMap(
				(s) => (s.grading_runs[0]?.grading_results ?? []) as GradingResult[],
			)

			const byQuestion = new Map<string, GradingResult[]>()
			for (const r of allResults) {
				const existing = byQuestion.get(r.question_id) ?? []
				existing.push(r)
				byQuestion.set(r.question_id, existing)
			}

			const questionStats = []
			for (const [questionId, results] of byQuestion) {
				const first = results[0]
				if (!first) continue
				const avgAwarded =
					results.reduce((s, r) => s + r.awarded_score, 0) / results.length
				const avgPercent =
					first.max_score > 0
						? Math.round((avgAwarded / first.max_score) * 100)
						: 0
				questionStats.push({
					question_id: questionId,
					question_text: first.question_text,
					question_number: first.question_number,
					max_score: first.max_score,
					avg_awarded: Math.round(avgAwarded * 10) / 10,
					avg_percent: avgPercent,
					submission_count: results.length,
				})
			}
			questionStats.sort(
				(a, b) =>
					Number.parseInt(a.question_number) -
					Number.parseInt(b.question_number),
			)

			const allTotals = subs.map((s) => {
				const results = (s.grading_runs[0]?.grading_results ??
					[]) as GradingResult[]
				const awarded = results.reduce((sum, r) => sum + r.awarded_score, 0)
				const max = results.reduce((sum, r) => sum + r.max_score, 0)
				return max > 0 ? (awarded / max) * 100 : 0
			})
			const avgTotalPercent =
				allTotals.length > 0
					? Math.round(allTotals.reduce((s, v) => s + v, 0) / allTotals.length)
					: 0

			return {
				stats: {
					exam_paper_id: examPaperId,
					exam_paper_title: subs[0]?.exam_paper?.title ?? "Unknown",
					submission_count: subs.length,
					avg_total_percent: avgTotalPercent,
					question_stats: questionStats,
				},
			}
		},
	)

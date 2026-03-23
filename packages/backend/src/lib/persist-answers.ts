import { db } from "@/db"
import type { GradingResult } from "@/lib/grade-questions"
import { logger } from "@/lib/logger"

const TAG = "persist-answers"

export type PersistAnswerRowsArgs = {
	gradingResults: GradingResult[]
	studentId: string
	jobId: string
}

/**
 * Persists normalised Answer + MarkingResult rows when a Student record
 * is linked to the job. Failures are non-fatal — the JSON blob in
 * studentPaperJob already carries the results.
 */
export async function persistAnswerRows(
	args: PersistAnswerRowsArgs,
): Promise<void> {
	const { gradingResults, studentId, jobId } = args

	try {
		const markedAt = new Date()
		for (const r of gradingResults) {
			const answer = await db.answer.create({
				data: {
					question_id: r.question_id,
					student_id: studentId,
					student_answer: r.student_answer,
					total_score: r.awarded_score,
					max_possible_score: r.max_score,
					marking_status: "completed",
					source: "scanned",
					marked_at: markedAt,
				},
			})
			if (r.mark_scheme_id) {
				await db.markingResult.create({
					data: {
						answer_id: answer.id,
						mark_scheme_id: r.mark_scheme_id,
						mark_points_results: r.mark_points_results,
						total_score: r.awarded_score,
						max_possible_score: r.max_score,
						llm_reasoning: r.llm_reasoning,
						feedback_summary: r.feedback_summary,
						level_awarded: r.level_awarded ?? null,
						why_not_next_level: r.why_not_next_level ?? null,
						cap_applied: r.cap_applied ?? null,
					},
				})
			}
		}
		logger.info(TAG, "Answer + MarkingResult rows written", {
			jobId,
			student_id: studentId,
			count: gradingResults.length,
		})
	} catch (persistErr) {
		logger.error(
			TAG,
			"Failed to persist Answer/MarkingResult rows — non-fatal",
			{
				jobId,
				error: String(persistErr),
			},
		)
	}
}

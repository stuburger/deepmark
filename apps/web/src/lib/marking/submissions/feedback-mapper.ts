import type { SubmissionFeedback, SubmissionFeedbackRating } from "../types"

type SubmissionFeedbackRow = {
	id: string
	submission_id: string
	rating: string
	categories: unknown
	comment: string | null
	grading_run_id: string | null
	created_at: Date
	updated_at: Date
}

/**
 * Maps a raw submission_feedback row (categories as Prisma.Json) to the
 * client-shaped SubmissionFeedback type. Shared between the queries and
 * mutations modules so they stay in sync.
 */
export function toSubmissionFeedback(
	row: SubmissionFeedbackRow,
): SubmissionFeedback {
	return {
		id: row.id,
		submission_id: row.submission_id,
		rating: row.rating as SubmissionFeedbackRating,
		categories: (row.categories as SubmissionFeedback["categories"]) ?? null,
		comment: row.comment,
		grading_run_id: row.grading_run_id,
		created_at: row.created_at,
		updated_at: row.updated_at,
	}
}

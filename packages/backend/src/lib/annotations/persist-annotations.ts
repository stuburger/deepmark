import { db } from "@/db"
import type { Prisma } from "@mcp-gcse/db"
import type { PendingAnnotation } from "./types"

/**
 * Single-pass insert: every annotation is self-contained, no parent linking.
 * Resolves the submission_id from the grading run so callers don't have to
 * know that `grading_run_id === submission_id` by migration convention.
 */
export async function persistAnnotations(
	gradingRunId: string,
	perQuestionGroups: PendingAnnotation[][],
): Promise<number> {
	const gr = await db.gradingRun.findUniqueOrThrow({
		where: { id: gradingRunId },
		select: { submission_id: true },
	})
	let total = 0

	for (const questionAnnotations of perQuestionGroups) {
		for (const a of questionAnnotations) {
			await db.studentPaperAnnotation.create({
				data: {
					grading_run_id: gradingRunId,
					submission_id: gr.submission_id,
					question_id: a.questionId,
					page_order: a.pageOrder,
					overlay_type: a.overlayType,
					sentiment: a.sentiment,
					payload: a.payload as Prisma.InputJsonValue,
					anchor_token_start_id: a.anchorTokenStartId,
					anchor_token_end_id: a.anchorTokenEndId,
					bbox: a.bbox,
					sort_order: a.sortOrder,
				},
			})
			total++
		}
	}

	return total
}

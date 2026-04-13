import { db } from "@/db"
import type { PendingAnnotation } from "./types"

/**
 * Single-pass insert: every annotation is self-contained, no parent linking.
 */
export async function persistAnnotations(
	enrichmentRunId: string,
	perQuestionGroups: PendingAnnotation[][],
): Promise<number> {
	let total = 0

	for (const questionAnnotations of perQuestionGroups) {
		for (const a of questionAnnotations) {
			await db.studentPaperAnnotation.create({
				data: {
					enrichment_run_id: enrichmentRunId,
					question_id: a.questionId,
					page_order: a.pageOrder,
					overlay_type: a.overlayType,
					sentiment: a.sentiment,
					payload: a.payload as any,
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

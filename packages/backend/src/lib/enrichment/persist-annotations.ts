import { db } from "@/db"
import type { PendingAnnotation } from "./types"

/**
 * Two-pass insert: marks+chains first (no parent FK), then tags+comments
 * with parent_annotation_id referencing the first-pass records.
 *
 * parentIndex is a local index within each question's annotation array.
 */
export async function persistAnnotations(
	enrichmentRunId: string,
	perQuestionGroups: PendingAnnotation[][],
): Promise<number> {
	let total = 0

	for (const questionAnnotations of perQuestionGroups) {
		const indexToDbId = new Map<number, string>()

		// Pass 1: insert marks and chains (no parent FK)
		for (let i = 0; i < questionAnnotations.length; i++) {
			const a = questionAnnotations[i]
			if (a.overlayType !== "mark" && a.overlayType !== "chain") continue

			const created = await db.studentPaperAnnotation.create({
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
			indexToDbId.set(i, created.id)
			total++
		}

		// Pass 2: insert tags and comments with parent FK
		for (const a of questionAnnotations) {
			if (a.overlayType !== "tag" && a.overlayType !== "comment") continue

			const parentDbId =
				a.parentIndex !== undefined
					? (indexToDbId.get(a.parentIndex) ?? null)
					: null

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
					parent_annotation_id: parentDbId,
					sort_order: a.sortOrder,
				},
			})
			total++
		}
	}

	return total
}

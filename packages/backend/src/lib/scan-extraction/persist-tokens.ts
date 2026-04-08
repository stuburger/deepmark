import { db } from "@/db"
import { logger } from "@/lib/infra/logger"
import type { VisionPageResult } from "@/lib/scan-extraction/cloud-vision-ocr"

const TAG = "student-paper-extract"

type SortedPage = {
	order: number
}

/**
 * Builds token rows from Cloud Vision results and bulk-inserts them into the DB.
 * Returns the inserted rows with DB-generated IDs for downstream reconciliation.
 */
export async function persistTokens(
	jobId: string,
	sortedPages: SortedPage[],
	visionResults: (VisionPageResult | null)[],
) {
	const tokenRows = visionResults.flatMap((result, i) => {
		if (!result) return []
		const pageOrder = sortedPages[i]?.order
		if (pageOrder == null) {
			throw new Error(
				`sortedPages[${i}] is undefined while building tokenRows — arrays are out of sync`,
			)
		}
		return result.tokens.map((t) => ({
			submission_id: jobId,
			page_order: pageOrder,
			para_index: t.para_index,
			line_index: t.line_index,
			word_index: t.word_index,
			text_raw: t.text_raw,
			bbox: t.bbox as [number, number, number, number],
			confidence: t.confidence,
		}))
	})

	const insertedTokens =
		tokenRows.length > 0
			? await db.studentPaperPageToken.createManyAndReturn({
					data: tokenRows,
					select: {
						id: true,
						page_order: true,
						para_index: true,
						line_index: true,
						word_index: true,
						text_raw: true,
						bbox: true,
					},
				})
			: []

	if (insertedTokens.length > 0) {
		logger.info(TAG, "Word tokens inserted", {
			jobId,
			token_count: insertedTokens.length,
		})
	}

	return insertedTokens
}

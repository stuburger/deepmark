import { db } from "@/db"
import type { PageToken } from "@mcp-gcse/shared"
import { z } from "zod"

/** [yMin, xMin, yMax, xMax] normalised 0–1000 — column shape on student_paper_page_tokens. */
const BboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])

/**
 * Loads page tokens for a submission grouped by question_id, ordered
 * spatially (page → para → line → word). Tokens without a question
 * assignment are dropped.
 *
 * `answer_char_start` / `answer_char_end` are always returned as null on
 * the Lambda side: alignment is recomputed on demand from raw tokens.
 */
export async function loadTokensByQuestion(
	submissionId: string,
): Promise<Map<string, PageToken[]>> {
	const tokenRows = await db.studentPaperPageToken.findMany({
		where: { submission_id: submissionId, question_id: { not: null } },
		orderBy: [
			{ page_order: "asc" },
			{ para_index: "asc" },
			{ line_index: "asc" },
			{ word_index: "asc" },
		],
		select: {
			id: true,
			page_order: true,
			para_index: true,
			line_index: true,
			word_index: true,
			text_raw: true,
			text_corrected: true,
			bbox: true,
			confidence: true,
			question_id: true,
		},
	})

	const tokensByQuestion = new Map<string, PageToken[]>()
	for (const t of tokenRows) {
		if (!t.question_id) continue
		const list = tokensByQuestion.get(t.question_id) ?? []
		list.push({
			id: t.id,
			page_order: t.page_order,
			para_index: t.para_index,
			line_index: t.line_index,
			word_index: t.word_index,
			text_raw: t.text_raw,
			text_corrected: t.text_corrected,
			bbox: BboxSchema.parse(t.bbox),
			confidence: t.confidence,
			question_id: t.question_id,
			// alignTokensToAnswer recomputes char ranges from text + tokens on
			// the Lambda side, so the precomputed offsets read by web's
			// alignmentFromPrecomputed are intentionally omitted here.
			answer_char_start: null,
			answer_char_end: null,
		})
		tokensByQuestion.set(t.question_id, list)
	}

	return tokensByQuestion
}

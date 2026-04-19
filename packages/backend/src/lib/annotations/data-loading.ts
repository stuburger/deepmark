import { db } from "@/db"
import type { AnswerRegionRow, TokenRow } from "./types"

export type AnnotationContext = {
	allTokens: TokenRow[]
	regionByQuestion: Map<string, AnswerRegionRow>
	examBoard: string | null
	levelDescriptors: string | null
	subject: string | null
}

/**
 * Loads the submission-level annotation data (tokens, answer regions, exam
 * paper metadata) needed to emit annotations alongside grading. Mark schemes
 * are not loaded here — each question already carries its own via the
 * question list.
 */
export async function loadAnnotationContext(
	submissionId: string,
): Promise<AnnotationContext> {
	const sub = await db.studentSubmission.findUniqueOrThrow({
		where: { id: submissionId },
		include: {
			exam_paper: {
				select: { exam_board: true, level_descriptors: true, subject: true },
			},
		},
	})

	const answerRegions = await db.studentPaperAnswerRegion.findMany({
		where: { submission_id: submissionId },
		select: { question_id: true, page_order: true, box: true },
	})
	const regionByQuestion = new Map<string, AnswerRegionRow>()
	for (const r of answerRegions) {
		const existing = regionByQuestion.get(r.question_id)
		if (!existing || r.page_order < existing.page_order) {
			regionByQuestion.set(r.question_id, r)
		}
	}

	const allTokens = await db.studentPaperPageToken.findMany({
		where: { submission_id: submissionId },
		orderBy: [
			{ page_order: "asc" },
			{ para_index: "asc" },
			{ line_index: "asc" },
			{ word_index: "asc" },
		],
		select: {
			id: true,
			page_order: true,
			text_raw: true,
			text_corrected: true,
			bbox: true,
			question_id: true,
		},
	})

	return {
		allTokens,
		regionByQuestion,
		examBoard: sub.exam_paper?.exam_board ?? null,
		levelDescriptors: sub.exam_paper?.level_descriptors ?? null,
		subject: sub.exam_paper?.subject ?? null,
	}
}

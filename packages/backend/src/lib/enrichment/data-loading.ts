import { db } from "@/db"
import type { GradingResult } from "@/lib/grading/grade-questions"
import type {
	AnswerRegionRow,
	MarkSchemeForAnnotation,
	TokenRow,
} from "./types"

export type EnrichmentData = {
	gradingResults: GradingResult[]
	allTokens: TokenRow[]
	regionByQuestion: Map<string, AnswerRegionRow>
	markSchemeMap: Map<string, MarkSchemeForAnnotation>
	examBoard: string | null
	levelDescriptors: string | null
	subject: string | null
}

/**
 * Loads all data needed for enrichment: grading results, tokens,
 * answer regions, mark schemes, and exam paper metadata.
 *
 * Returns null if there are no grading results (nothing to annotate).
 */
export async function loadEnrichmentData(
	jobId: string,
): Promise<EnrichmentData | null> {
	const sub = await db.studentSubmission.findUniqueOrThrow({
		where: { id: jobId },
		include: {
			exam_paper: {
				select: { exam_board: true, level_descriptors: true, subject: true },
			},
			grading_runs: {
				orderBy: { created_at: "desc" },
				take: 1,
				select: { grading_results: true },
			},
		},
	})

	const gradingResults = (sub.grading_runs[0]?.grading_results ??
		[]) as GradingResult[]
	if (gradingResults.length === 0) return null

	// Load answer regions — use the region with the lowest page_order per question
	const answerRegions = await db.studentPaperAnswerRegion.findMany({
		where: { submission_id: jobId },
		select: { question_id: true, page_order: true, box: true },
	})
	const regionByQuestion = new Map<string, AnswerRegionRow>()
	for (const r of answerRegions) {
		const existing = regionByQuestion.get(r.question_id)
		if (!existing || r.page_order < existing.page_order) {
			regionByQuestion.set(r.question_id, r)
		}
	}

	// Load all tokens ordered by reading position
	const allTokens = await db.studentPaperPageToken.findMany({
		where: { submission_id: jobId },
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

	// Batch-load mark schemes for all graded questions
	const markSchemeIds = [
		...new Set(
			gradingResults
				.map((r) => r.mark_scheme_id)
				.filter((id): id is string => id !== null),
		),
	]
	const markSchemes =
		markSchemeIds.length > 0
			? await db.markScheme.findMany({
					where: { id: { in: markSchemeIds } },
					select: {
						id: true,
						description: true,
						guidance: true,
						mark_points: true,
						marking_method: true,
						content: true,
					},
				})
			: []
	const markSchemeMap = new Map(markSchemes.map((ms) => [ms.id, ms]))

	return {
		gradingResults,
		allTokens,
		regionByQuestion,
		markSchemeMap,
		examBoard: sub.exam_paper?.exam_board ?? null,
		levelDescriptors: sub.exam_paper?.level_descriptors ?? null,
		subject: sub.exam_paper?.subject ?? null,
	}
}

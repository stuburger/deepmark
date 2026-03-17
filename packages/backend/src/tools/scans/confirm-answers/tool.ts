import { tool } from "@/tools/shared/tool-utils"
import { db } from "@/db"
import { markAnswerById } from "@/services/mark-answer"
import { ConfirmScanAnswersSchema } from "./schema"

export const handler = tool(ConfirmScanAnswersSchema, async (args, extra) => {
	const { scan_submission_id, corrections } = args
	const userId = extra.authInfo.extra.userId

	const submission = await db.scanSubmission.findFirstOrThrow({
		where: { id: scan_submission_id, student_id: userId },
	})

	if (submission.status !== "extracted") {
		throw new Error(
			`Scan submission must be in status 'extracted' before confirming. Current status: ${submission.status}. Run review-extracted-answers first.`,
		)
	}

	const correctionMap = new Map(
		(corrections ?? []).map((c) => [c.extracted_answer_id, c.corrected_text]),
	)

	const extracted = await db.extractedAnswer.findMany({
		where: { scan_page: { scan_submission_id }, answer_id: null },
		include: {
			scan_page: true,
			question: true,
			question_part: true,
		},
	})

	const created: string[] = []
	const markingResults: Array<{ answer_id: string; total_score: number; max_possible_score: number }> = []

	for (const e of extracted) {
		const markScheme = await db.markScheme.findFirst({
			where: {
				question_id: e.question_id,
				question_part_id: e.question_part_id,
			},
		})
		if (!markScheme) continue

		const studentAnswer = correctionMap.get(e.id) ?? e.extracted_text

		const answer = await db.answer.create({
			data: {
				question_id: e.question_id,
				question_part_id: e.question_part_id,
				student_id: submission.student_id,
				student_answer: studentAnswer,
				max_possible_score: markScheme.points_total,
				source: "scanned",
			},
		})

		await db.extractedAnswer.update({
			where: { id: e.id },
			data: { answer_id: answer.id },
		})

		created.push(answer.id)

		const result = await markAnswerById(answer.id)
		if (result.marked && result.total_score != null && result.max_possible_score != null) {
			markingResults.push({
				answer_id: answer.id,
				total_score: result.total_score,
				max_possible_score: result.max_possible_score,
			})
		}
	}

	return JSON.stringify(
		{
			scan_submission_id,
			answers_created: created.length,
			answer_ids: created,
			marking_results: markingResults,
			total_score: markingResults.reduce((s, r) => s + r.total_score, 0),
			max_possible: markingResults.reduce((s, r) => s + r.max_possible_score, 0),
		},
		null,
		2,
	)
})

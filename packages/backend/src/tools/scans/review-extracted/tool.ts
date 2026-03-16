import { tool } from "@/tools/shared/tool-utils"
import { db } from "@/db"
import { ReviewExtractedAnswersSchema } from "./schema"

export const handler = tool(ReviewExtractedAnswersSchema, async (args, extra) => {
	const { scan_submission_id } = args
	const userId = extra.authInfo.extra.userId

	const submission = await db.scanSubmission.findFirstOrThrow({
		where: { id: scan_submission_id, student_id: userId },
	})

	const extracted = await db.extractedAnswer.findMany({
		where: { scan_page: { scan_submission_id } },
		include: {
			scan_page: { select: { page_number: true } },
			question: { select: { id: true, text: true } },
			question_part: { select: { id: true, part_label: true, text: true } },
		},
		orderBy: [{ scan_page: { page_number: "asc" } }, { question_id: "asc" }],
	})

	const list = extracted.map((e) => ({
		extracted_answer_id: e.id,
		page_number: e.scan_page.page_number,
		question_id: e.question_id,
		question_text: e.question.text,
		question_part: e.question_part
			? { id: e.question_part.id, part_label: e.question_part.part_label, text: e.question_part.text }
			: null,
		extracted_text: e.extracted_text,
		bounding_boxes: e.bounding_boxes,
		confidence: e.confidence,
	}))

	return JSON.stringify(
		{
			scan_submission_id,
			status: submission.status,
			extracted_answers: list,
		},
		null,
		2,
	)
})

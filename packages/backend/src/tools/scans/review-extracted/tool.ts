import { db } from "@/db"
import { tool } from "@/tools/shared/tool-utils"
import { ReviewExtractedAnswersSchema } from "./schema"

export const handler = tool(
	ReviewExtractedAnswersSchema,
	async (args, extra) => {
		const { scan_submission_id } = args
		const userId = extra.authInfo.extra.userId

		const submission = await db.scanSubmission.findFirstOrThrow({
			where: { id: scan_submission_id, uploaded_by_id: userId },
		})

		const extracted = await db.extractedAnswer.findMany({
			where: { scan_submission_id },
			include: {
				question: { select: { id: true, text: true } },
				question_part: { select: { id: true, part_label: true, text: true } },
			},
			orderBy: [{ question_id: "asc" }],
		})

		type PageSegment = {
			page_number: number
			segment_text: string
			bounding_boxes: unknown[]
		}

		const list = extracted.map((e) => {
			const segments = (e.page_segments as PageSegment[] | null) ?? []
			const pageNumbers = segments.map((s) => s.page_number)
			return {
				extracted_answer_id: e.id,
				page_numbers: pageNumbers,
				question_id: e.question_id,
				question_text: e.question.text,
				question_part: e.question_part
					? {
							id: e.question_part.id,
							part_label: e.question_part.part_label,
							text: e.question_part.text,
						}
					: null,
				extracted_text: e.extracted_text,
				page_segments: e.page_segments,
				confidence: e.confidence,
			}
		})

		return JSON.stringify(
			{
				scan_submission_id,
				status: submission.status,
				extracted_answers: list,
			},
			null,
			2,
		)
	},
)

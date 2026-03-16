import { tool } from "@/tools/shared/tool-utils"
import { db } from "@/db"
import { GetScanSubmissionSchema } from "./schema"

export const handler = tool(GetScanSubmissionSchema, async (args, extra) => {
	const { scan_submission_id } = args
	const userId = extra.authInfo.extra.userId

	const submission = await db.scanSubmission.findFirstOrThrow({
		where: { id: scan_submission_id, student_id: userId },
		include: {
			pages: { orderBy: { page_number: "asc" } },
			exam_paper: { select: { title: true } },
		},
	})

	const pageSummary = submission.pages.map((p) => ({
		page_number: p.page_number,
		ocr_status: p.ocr_status,
		processed_at: p.processed_at?.toISOString() ?? null,
		error_message: p.error_message,
	}))

	const extractedCount = await db.extractedAnswer.count({
		where: {
			scan_page: { scan_submission_id },
		},
	})

	return JSON.stringify(
		{
			scan_submission_id: submission.id,
			status: submission.status,
			page_count: submission.page_count,
			exam_paper_title: submission.exam_paper.title,
			uploaded_at: submission.uploaded_at.toISOString(),
			processed_at: submission.processed_at?.toISOString() ?? null,
			error_message: submission.error_message,
			pages: pageSummary,
			extracted_answers_count: extractedCount,
		},
		null,
		2,
	)
})

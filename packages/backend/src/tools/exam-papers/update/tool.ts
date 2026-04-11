import { UpdateExamPaperSchema } from "./schema"

import { db } from "@/db"
import { tool } from "@/tools/shared/tool-utils"

export const handler = tool(UpdateExamPaperSchema, async (args, extra) => {
	const {
		exam_paper_id,
		title,
		subject,
		year,
		paper_number,
		duration_minutes,
		total_marks,
		is_active,
	} = args

	console.log("[update-exam-paper] Handler invoked", {
		exam_paper_id,
		hasTitle: !!title,
		hasSubject: !!subject,
	})

	// Check if exam paper exists
	await db.examPaper.findUniqueOrThrow({
		where: { id: exam_paper_id },
	})

	// Prepare update object
	const update: Record<string, unknown> = {}

	if (title !== undefined) update.title = title
	if (subject !== undefined) update.subject = subject
	if (year !== undefined) update.year = year
	if (paper_number !== undefined) update.paper_number = paper_number
	if (duration_minutes !== undefined) update.duration_minutes = duration_minutes
	if (is_active !== undefined) update.is_active = is_active
	if (total_marks !== undefined) update.total_marks = total_marks

	console.log("[update-exam-paper] Updating exam paper", { update })

	await db.examPaper.update({ where: { id: exam_paper_id }, data: update as any })

	console.log("[update-exam-paper] Exam paper updated successfully", {
		examPaperId: exam_paper_id,
	})

	return `Exam paper updated successfully!
Exam Paper ID: ${exam_paper_id}`
})

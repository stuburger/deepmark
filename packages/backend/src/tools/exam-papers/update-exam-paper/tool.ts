import { UpdateExamPaperSchema } from "./schema"

import { tool } from "@/tools/shared/tool-utils"
import { db } from "@/db"
import type { ExamPaper } from "@/generated/prisma"

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
	const existingExamPaper = await db.examPaper.findUniqueOrThrow({
		where: { id: exam_paper_id },
		include: { exam_sessions: true },
	})

	if (existingExamPaper.exam_sessions.length > 0) {
		throw new Error("Cannot update an exam paper with more than 0 sessions")
	}

	// Prepare update object
	const update: Partial<ExamPaper> = {}

	if (title !== undefined) update.title = title
	if (subject !== undefined) update.subject = subject
	if (year !== undefined) update.year = year
	if (paper_number !== undefined) update.paper_number = paper_number
	if (duration_minutes !== undefined) update.duration_minutes = duration_minutes
	if (is_active !== undefined) update.is_active = is_active
	if (total_marks !== undefined) update.is_active = is_active

	console.log("[update-exam-paper] Updating exam paper", { update })

	await db.examPaper.update({ where: { id: exam_paper_id }, data: update })

	console.log("[update-exam-paper] Exam paper updated successfully", {
		examPaperId: exam_paper_id,
	})

	return `Exam paper updated successfully!
Exam Paper ID: ${exam_paper_id}`
})

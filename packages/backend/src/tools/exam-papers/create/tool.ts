import { db } from "@/db"
import { tool } from "@/tools/shared/tool-utils"
import { ObjectId } from "mongodb"
import { CreateExamPaperSchema } from "./schema"

export const handler = tool(CreateExamPaperSchema, async (args, extra) => {
	const { userId } = extra.authInfo.extra

	const {
		title,
		subject,
		year,
		paper_number,
		total_marks,
		duration_minutes,
		metadata,
	} = args

	console.log("[create-exam-paper] Handler invoked", {
		title,
		subject,
		year,
		paper_number,
		duration_minutes,
	})

	// Create the exam paper document

	console.log("[create-exam-paper] Creating exam paper")

	// Insert the exam paper into the database
	const paper = await db.examPaper.create({
		data: {
			title,
			subject,
			year,
			paper_number,
			created_by_id: userId,
			total_marks: total_marks,
			duration_minutes,
			created_at: new Date(),
			is_active: true,
			metadata: metadata || {
				difficulty_level: "higher",
				tier: "higher",
				season: "summer",
			},
		},
	})

	console.log("[create-exam-paper] Exam paper created successfully", {
		examPaperId: paper.id,
	})

	return `Exam paper created successfully! 
  
Exam Paper ID: ${paper.id}
Title: ${title}
Subject: ${subject}
Year: ${year}
Duration: ${duration_minutes} minutes
Total Marks: ${paper.total_marks}`
})

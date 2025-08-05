import { GetExamSessionByIdSchema } from "./schema"
import { exam_sessions } from "../../db/collections/exam-sessions"
import { exam_papers } from "../../db/collections/exam-papers"
import { ObjectId } from "mongodb"
import { tool, json } from "@/tools/shared/tool-utils"

export const handler = tool(GetExamSessionByIdSchema, async (args) => {
	const { session_id } = args

	console.log("[get-exam-session-by-id] Handler invoked", { session_id })

	// Validate ObjectId format
	if (!ObjectId.isValid(session_id)) {
		throw new Error("Invalid session ID format")
	}

	const sessionObjectId = new ObjectId(session_id)

	// Find the exam session
	const examSession = await exam_sessions.findOne({ _id: sessionObjectId })

	if (!examSession) {
		throw new Error(`Exam session with ID ${session_id} not found`)
	}

	// Get exam paper details
	const examPaper = await exam_papers.findOne({
		_id: examSession.exam_paper_id,
	})

	// Calculate duration if session is completed
	let duration = null
	if (examSession.completed_at) {
		duration = Math.round(
			(examSession.completed_at.getTime() - examSession.started_at.getTime()) /
				60000,
		)
	}

	// Calculate percentage if score is available
	let percentage = null
	if (examSession.total_score !== undefined) {
		percentage =
			(examSession.total_score / examSession.max_possible_score) * 100
	}

	const result = {
		...examSession,
		exam_paper: examPaper
			? {
					_id: examPaper._id.toString(),
					title: examPaper.title,
					subject: examPaper.subject,
					year: examPaper.year,
					duration_minutes: examPaper.duration_minutes,
				}
			: null,
		duration_minutes: duration,
		percentage_score: percentage,
	}

	console.log("[get-exam-session-by-id] Exam session retrieved successfully", {
		sessionId: session_id,
		status: examSession.status,
		hasScore: examSession.total_score !== undefined,
	})

	return json(result)
})

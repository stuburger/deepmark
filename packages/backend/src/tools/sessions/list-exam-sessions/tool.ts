import { ListExamSessionsSchema } from "./schema"
import { exam_sessions } from "../../db/collections/exam-sessions"
import { exam_papers } from "../../db/collections/exam-papers"
import { ObjectId } from "mongodb"
import { tool } from "@/tools/shared/tool-utils"

export const handler = tool(ListExamSessionsSchema, async (args) => {
	const { exam_paper_id, student_id, status, limit, skip } = args

	console.log("[list-exam-sessions] Handler invoked", {
		exam_paper_id,
		student_id,
		status,
		limit,
		skip,
	})

	// Build filter object
	const filter: any = {}

	if (exam_paper_id) {
		if (!ObjectId.isValid(exam_paper_id)) {
			throw new Error("Invalid exam paper ID format")
		}
		filter.exam_paper_id = new ObjectId(exam_paper_id)
	}

	if (student_id) {
		filter.student_id = student_id
	}

	if (status) {
		filter.status = status
	}

	// Get exam sessions with pagination
	const sessions = await exam_sessions
		.find(filter)
		.sort({ started_at: -1 })
		.skip(skip)
		.limit(limit)
		.toArray()

	// Get total count for pagination info
	const totalCount = await exam_sessions.countDocuments(filter)

	// Get exam paper details for each session
	const examPaperIds = [...new Set(sessions.map((s) => s.exam_paper_id))]
	const examPapers = await exam_papers
		.find({ _id: { $in: examPaperIds } })
		.project({
			_id: 1,
			title: 1,
			subject: 1,
			year: 1,
		})
		.toArray()

	const examPaperMap = new Map(examPapers.map((ep) => [ep._id.toString(), ep]))

	// Enhance sessions with exam paper details and calculated fields
	const enhancedSessions = sessions.map((session) => {
		const examPaper = examPaperMap.get(session.exam_paper_id.toString())

		// Calculate duration if completed
		let duration = null
		if (session.completed_at) {
			duration = Math.round(
				(session.completed_at.getTime() - session.started_at.getTime()) / 60000,
			)
		}

		// Calculate percentage if score is available
		let percentage = null
		if (session.total_score !== undefined) {
			percentage = (session.total_score / session.max_possible_score) * 100
		}

		return {
			...session,
			exam_paper: examPaper
				? {
						_id: examPaper._id.toString(),
						title: examPaper.title,
						subject: examPaper.subject,
						year: examPaper.year,
					}
				: null,
			duration_minutes: duration,
			percentage_score: percentage,
		}
	})

	const result = {
		sessions: enhancedSessions,
		pagination: {
			total: totalCount,
			limit,
			skip,
			has_more: skip + limit < totalCount,
		},
		filters: {
			exam_paper_id,
			student_id,
			status,
		},
	}

	console.log("[list-exam-sessions] Exam sessions retrieved successfully", {
		sessionCount: sessions.length,
		totalCount,
		hasMore: result.pagination.has_more,
	})

	return text(JSON.stringify(result, null, 2), result)
})

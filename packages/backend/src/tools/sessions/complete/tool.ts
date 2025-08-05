import { CompleteExamSessionSchema } from "./schema"
import { exam_sessions } from "../../db/collections/exam-sessions"
import { ObjectId } from "mongodb"
import { tool } from "@/tools/shared/tool-utils"

export const handler = tool(CompleteExamSessionSchema, async (args) => {
	const { session_id, total_score, status } = args

	console.log("[complete-exam-session] Handler invoked", {
		session_id,
		total_score,
		status,
	})

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

	if (examSession.status !== "in_progress") {
		throw new Error(
			`Exam session with ID ${session_id} is already ${examSession.status}`,
		)
	}

	// Validate total score doesn't exceed max possible score
	if (total_score > examSession.max_possible_score) {
		throw new Error(
			`Total score (${total_score}) cannot exceed maximum possible score (${examSession.max_possible_score})`,
		)
	}

	// Calculate percentage score
	const percentageScore = (total_score / examSession.max_possible_score) * 100

	// Update the exam session
	const result = await exam_sessions.updateOne(
		{ _id: sessionObjectId },
		{
			$set: {
				status,
				total_score,
				completed_at: new Date(),
			},
		},
	)

	if (result.matchedCount === 0) {
		throw new Error(`Exam session with ID ${session_id} not found`)
	}

	if (result.modifiedCount === 0) {
		console.log("[complete-exam-session] No changes made to exam session")
		return text(
			"Exam session completed successfully (no changes were necessary)",
		)
	}

	console.log("[complete-exam-session] Exam session completed successfully", {
		sessionId: session_id,
		status,
		totalScore: total_score,
		percentageScore,
	})

	return text(
		`Exam session completed successfully!

Session ID: ${session_id}
Status: ${status}
Total Score: ${total_score}/${examSession.max_possible_score}
Percentage: ${percentageScore.toFixed(1)}%
Completed At: ${new Date().toISOString()}`,
	)
})

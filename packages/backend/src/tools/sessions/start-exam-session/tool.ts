import { StartExamSessionSchema } from "./schema"
import { exam_sessions, ExamSession } from "../../db/collections/exam-sessions"
import { exam_papers } from "../../db/collections/exam-papers"
import { ObjectId } from "mongodb"
import { tool } from "@/tools/shared/tool-utils"

export const handler = tool(StartExamSessionSchema, async (args) => {
	const { exam_paper_id, student_id, metadata } = args

	console.log("[start-exam-session] Handler invoked", {
		exam_paper_id,
		student_id,
		hasMetadata: !!metadata,
	})

	// Validate ObjectId format
	if (!ObjectId.isValid(exam_paper_id)) {
		throw new Error("Invalid exam paper ID format")
	}

	const examPaperObjectId = new ObjectId(exam_paper_id)

	// Check if exam paper exists and is active
	const examPaper = await exam_papers.findOne({
		_id: examPaperObjectId,
		is_active: true,
	})

	if (!examPaper) {
		throw new Error(`Active exam paper with ID ${exam_paper_id} not found`)
	}

	// Check if student already has an active session for this exam paper
	const existingSession = await exam_sessions.findOne({
		exam_paper_id: examPaperObjectId,
		student_id,
		status: "in_progress",
	})

	if (existingSession) {
		throw new Error(
			`Student ${student_id} already has an active session for exam paper ${exam_paper_id}`,
		)
	}

	// Create new exam session
	const examSessionData: ExamSession = {
		_id: new ObjectId(),
		exam_paper_id: examPaperObjectId,
		student_id,
		started_at: new Date(),
		status: "in_progress",
		max_possible_score: examPaper.total_marks,
		metadata: metadata || {},
	}

	console.log("[start-exam-session] Creating exam session", {
		examSessionData,
	})

	// Insert the exam session into the database
	const result = await exam_sessions.insertOne(examSessionData)

	if (!result.insertedId) {
		console.log(
			"[start-exam-session] Failed to insert exam session - no insertedId returned",
		)
		throw new Error("Failed to insert exam session into database")
	}

	console.log("[start-exam-session] Exam session created successfully", {
		sessionId: result.insertedId,
		examPaperId: exam_paper_id,
		studentId: student_id,
	})

	const metadataInfo = metadata
		? `\nMetadata:
  Location: ${metadata.location || "Not specified"}
  Invigilator: ${metadata.invigilator || "Not specified"}
  Special Requirements: ${metadata.special_requirements?.join(", ") || "None"}`
		: ""

	return text(
		`Exam session started successfully!

Session ID: ${result.insertedId}
Exam Paper: ${examPaper.title}
Student ID: ${student_id}
Started At: ${examSessionData.started_at.toISOString()}
Duration: ${examPaper.duration_minutes} minutes
Total Marks: ${examPaper.total_marks}${metadataInfo}`,
	)
})

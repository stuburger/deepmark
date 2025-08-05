import { ListQuestionsByExamPaperSchema } from "./schema"
import { exam_papers } from "../../db/collections/exam-papers"
import { questions } from "../../db/collections/questions"
import { ObjectId } from "mongodb"
import { tool, json } from "../shared/tool-utils"

export const handler = tool(ListQuestionsByExamPaperSchema, async (args) => {
	const { exam_paper_id, include_details } = args

	console.log("[list-questions-by-exam-paper] Handler invoked", {
		exam_paper_id,
		include_details,
	})

	// Validate ObjectId format
	if (!ObjectId.isValid(exam_paper_id)) {
		throw new Error("Invalid exam paper ID format")
	}

	const objectId = new ObjectId(exam_paper_id)

	// Find the exam paper
	const examPaper = await exam_papers.findOne({ _id: objectId })

	if (!examPaper) {
		throw new Error(`Exam paper with ID ${exam_paper_id} not found`)
	}

	// Extract all question IDs from all sections
	const allQuestionIds = examPaper.sections.flatMap(
		(section) => section.questions,
	)
	const uniqueQuestionIds = [...new Set(allQuestionIds)]

	if (include_details) {
		// Get full question details
		const questionDetails = await questions
			.find({ _id: { $in: uniqueQuestionIds.map((id) => new ObjectId(id)) } })
			.toArray()

		const questionMap = new Map(
			questionDetails.map((q) => [q._id.toString(), q]),
		)

		// Create result with sections and question details
		const result = {
			exam_paper_id: exam_paper_id,
			exam_paper_title: examPaper.title,
			total_questions: uniqueQuestionIds.length,
			sections: examPaper.sections.map((section) => ({
				section_id: section._id.toString(),
				title: section.title,
				description: section.description,
				total_marks: section.total_marks,
				instructions: section.instructions,
				questions: section.questions.map((questionId) => ({
					question_id: questionId,
					details: questionMap.get(questionId) || null,
				})),
			})),
		}

		console.log(
			"[list-questions-by-exam-paper] Questions retrieved with details",
			{
				examPaperId: exam_paper_id,
				sectionsCount: examPaper.sections.length,
				totalQuestions: uniqueQuestionIds.length,
			},
		)

		return json(result)
	} else {
		// Return just the question IDs organized by section
		const result = {
			exam_paper_id: exam_paper_id,
			exam_paper_title: examPaper.title,
			total_questions: uniqueQuestionIds.length,
			sections: examPaper.sections.map((section) => ({
				section_id: section._id.toString(),
				title: section.title,
				description: section.description,
				total_marks: section.total_marks,
				instructions: section.instructions,
				question_ids: section.questions,
			})),
			all_question_ids: uniqueQuestionIds,
		}

		console.log("[list-questions-by-exam-paper] Question IDs retrieved", {
			examPaperId: exam_paper_id,
			sectionsCount: examPaper.sections.length,
			totalQuestions: uniqueQuestionIds.length,
		})

		return json(result)
	}
})

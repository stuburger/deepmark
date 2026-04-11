import { db } from "@/db/client"
import { tool } from "@/tools/shared/tool-utils"
import { AddQuestionToExamPaperSchema } from "./schema"

export const handler = tool(
	AddQuestionToExamPaperSchema,
	async (args, extra) => {
		const userId = extra.authInfo.extra.userId
		const { exam_paper_id, question_id, section_title, section_order } = args

		console.log("[add-question-to-exam] Handler invoked", {
			exam_paper_id,
			question_id,
			section_title,
			section_order,
		})

		// Verify the exam paper exists and get its details
		const examPaper = await db.examPaper.findUniqueOrThrow({
			where: { id: exam_paper_id },
			select: { id: true, subject: true, title: true },
		})

		// Verify the question exists and get its details
		const question = await db.question.findUniqueOrThrow({
			where: { id: question_id },
			select: {
				id: true,
				subject: true,
				text: true,
				points: true,
				topic: true,
			},
		})

		// Verify the question subject matches the exam paper subject
		if (question.subject !== examPaper.subject) {
			throw new Error(
				`Question subject (${question.subject}) does not match exam paper subject (${examPaper.subject})`,
			)
		}

		// Check if the question is already assigned to this exam paper
		const existingAssignment = await db.examSectionQuestion.findFirst({
			where: {
				question_id: question_id,
				exam_section: {
					exam_paper_id: exam_paper_id,
				},
			},
			include: {
				exam_section: {
					select: { title: true },
				},
			},
		})

		if (existingAssignment) {
			throw new Error(
				`Question is already assigned to this exam paper in section "${existingAssignment.exam_section.title}"`,
			)
		}

		// Default section title if not provided
		const finalSectionTitle = section_title || "Section A"

		// Find or create the exam section
		let examSection = await db.examSection.findFirst({
			where: {
				exam_paper_id: exam_paper_id,
				title: finalSectionTitle,
			},
		})

		if (!examSection) {
			// Create new section if it doesn't exist
			const sectionCount = await db.examSection.count({
				where: { exam_paper_id: exam_paper_id },
			})

			examSection = await db.examSection.create({
				data: {
					exam_paper_id: exam_paper_id,
					title: finalSectionTitle,
					description: `Questions for ${finalSectionTitle}`,
					total_marks: question.points || 0, // Will be updated as questions are added
					order: sectionCount + 1,
					created_by_id: userId,
				},
			})

			console.log("[add-question-to-exam] Created new exam section", {
				sectionId: examSection.id,
				title: finalSectionTitle,
			})
		}

		// Get the next order for the question in this section
		const questionCount = await db.examSectionQuestion.count({
			where: { exam_section_id: examSection.id },
		})
		const finalQuestionOrder = section_order || questionCount + 1

		// Add the question to the exam section
		await db.examSectionQuestion.create({
			data: {
				exam_section_id: examSection.id,
				question_id: question_id,
				order: finalQuestionOrder,
			},
		})

		// Update the section's total marks
		const sectionTotalMarks = await db.examSectionQuestion.findMany({
			where: { exam_section_id: examSection.id },
			include: { question: { select: { points: true } } },
		})

		const totalMarks = sectionTotalMarks.reduce(
			(sum, esq) => sum + (esq.question.points || 0),
			0,
		)

		await db.examSection.update({
			where: { id: examSection.id },
			data: { total_marks: totalMarks },
		})

		console.log("[add-question-to-exam] Question added to exam section", {
			sectionId: examSection.id,
			questionOrder: finalQuestionOrder,
			updatedTotalMarks: totalMarks,
		})

		return `
✅ Question successfully added to exam paper!

📄 Exam Paper: ${examPaper.title}
❓ Question: ${question.text.slice(0, 50)}${question.text.length > 50 ? "..." : ""}
📋 Section: ${finalSectionTitle}
📍 Question order in section: ${finalQuestionOrder}
🎯 Question points: ${question.points || 0}
📊 Section total marks: ${totalMarks}
`
	},
)

import { db } from "@/db"
import { CreateQuestionSchema } from "./schema"
import { tool } from "@/tools/shared/tool-utils"

export const handler = tool(CreateQuestionSchema, async (args, extra) => {
	const userId = extra.authInfo.extra.userId
	const {
		topic,
		question_text,
		points,
		difficulty_level,
		subject,
		question_parts,
		exam_paper_id,
		section_title,
		section_order,
	} = args

	console.log("[create-question] Handler invoked", {
		topic,
		subject,
		points,
		difficulty_level,
		partsCount: question_parts.length,
		exam_paper_id,
		section_title,
		section_order,
	})

	// Create the question using Prisma
	const question = await db.question.create({
		data: {
			text: question_text,
			topic,
			subject,
			points,
			difficulty_level,
			created_by_id: userId,
			question_parts: {
				createMany: {
					data: question_parts.map((p, i) => ({
						created_by_id: userId,
						order: i,
						part_label: p.part_label,
						text: p.part_text,
						points: p.part_points,
						difficulty_level: p.part_difficulty_level,
					})),
				},
			},
		},
		include: {
			created_by: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
		},
	})

	console.log("[create-question] Question created successfully", {
		questionId: question.id,
		createdBy: question.created_by,
	})

	let examSectionInfo = ""

	// If exam_paper_id is provided, add the question to the exam paper
	if (exam_paper_id) {
		console.log("[create-question] Adding question to exam paper", {
			examPaperId: exam_paper_id,
		})

		// Verify the exam paper exists and get its subject
		const examPaper = await db.examPaper.findUniqueOrThrow({
			where: { id: exam_paper_id },
			select: { id: true, subject: true, title: true },
		})

		// Verify the question subject matches the exam paper subject
		if (examPaper.subject !== subject) {
			throw new Error(
				`Question subject (${subject}) does not match exam paper subject (${examPaper.subject})`,
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
					total_marks: points || 0, // Will be updated as questions are added
					order: sectionCount + 1,
					created_by_id: userId,
				},
			})

			console.log("[create-question] Created new exam section", {
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
				question_id: question.id,
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

		examSectionInfo = `

✅ Question added to exam paper: ${examPaper.title}
📋 Section: ${finalSectionTitle}
📍 Question order in section: ${finalQuestionOrder}`

		console.log("[create-question] Question added to exam section", {
			sectionId: examSection.id,
			questionOrder: finalQuestionOrder,
			updatedTotalMarks: totalMarks,
		})
	}

	return `
Question created successfully! 
Question ID: ${question.id}
Created by: ${question.created_by.name} (${question.created_by.email})${examSectionInfo}
`
})

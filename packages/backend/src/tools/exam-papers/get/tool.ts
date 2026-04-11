import { db } from "@/db"
import { tool } from "@/tools/shared/tool-utils"
import { GetExamPaperByIdSchema } from "./schema"

export const handler = tool(GetExamPaperByIdSchema, async (args, extra) => {
	const { userId } = extra.authInfo.extra
	const { exam_paper_id } = args

	console.log("[get-exam-paper-by-id] Handler invoked", {
		exam_paper_id,
		userId,
	})

	// Find the exam paper with all its relations
	const examPaper = await db.examPaper.findUniqueOrThrow({
		where: { id: exam_paper_id },
		include: {
			created_by: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			sections: {
				include: {
					exam_section_questions: {
						include: {
							question: {
								select: {
									id: true,
									text: true,
									subject: true,
									points: true,
									difficulty_level: true,
									topic: true,
								},
							},
						},
						orderBy: {
							order: "asc",
						},
					},
				},
				orderBy: {
					order: "asc",
				},
			},
		},
	})

	console.log("[get-exam-paper-by-id] Exam paper retrieved successfully", {
		examPaperId: exam_paper_id,
		title: examPaper.title,
		sectionsCount: examPaper.sections.length,
	})

	// Format the response as markdown
	let markdown = `# ${examPaper.title}\n\n`

	// Basic information
	markdown += "## Exam Information\n\n"
	markdown += `- **Subject**: ${examPaper.subject}\n`
	markdown += `- **Year**: ${examPaper.year}\n`
	if (examPaper.paper_number) {
		markdown += `- **Paper Number**: ${examPaper.paper_number}\n`
	}
	if (examPaper.exam_board) {
		markdown += `- **Exam Board**: ${examPaper.exam_board}\n`
	}
	markdown += `- **Duration**: ${examPaper.duration_minutes} minutes\n`
	markdown += `- **Total Marks**: ${examPaper.total_marks}\n`
	markdown += `- **Created by**: ${examPaper.created_by.name || examPaper.created_by.email || "Unknown"}\n`
	markdown += `- **Created**: ${examPaper.created_at.toLocaleDateString()}\n`

	if (examPaper.metadata) {
		const meta = examPaper.metadata as Record<string, unknown>
		markdown += `- **Difficulty Level**: ${meta.difficulty_level || "Not specified"}\n`
		markdown += `- **Tier**: ${meta.tier || "Not specified"}\n`
		markdown += `- **Season**: ${meta.season || "Not specified"}\n`
	}

	markdown += "\n"

	// Sections
	if (examPaper.sections && examPaper.sections.length > 0) {
		markdown += "## Sections\n\n"

		examPaper.sections.forEach((section, sectionIndex) => {
			markdown += `### ${section.title}\n\n`

			if (section.description) {
				markdown += `${section.description}\n\n`
			}

			if (section.instructions) {
				markdown += `**Instructions**: ${section.instructions}\n\n`
			}

			markdown += `**Total Marks**: ${section.total_marks}\n\n`

			if (
				section.exam_section_questions &&
				section.exam_section_questions.length > 0
			) {
				markdown += "#### Questions\n\n"

				section.exam_section_questions.forEach((esq, questionIndex) => {
					const question = esq.question
					markdown += `${questionIndex + 1}. **Question ${esq.order}**\n`
					markdown += `   - **Text**: ${question.text}\n`
					markdown += `   - **Subject**: ${question.subject}\n`
					markdown += `   - **Topic**: ${question.topic}\n`
					if (question.points) {
						markdown += `   - **Points**: ${question.points}\n`
					}
					if (question.difficulty_level) {
						markdown += `   - **Difficulty**: ${question.difficulty_level}\n`
					}
					markdown += "\n"
				})
			} else {
				markdown += "*No questions assigned to this section yet.*\n\n"
			}
		})
	} else {
		markdown +=
			"## Sections\n\n*No sections defined for this exam paper yet.*\n\n"
	}

	return markdown
})

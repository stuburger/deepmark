import { db } from "@/db"
import { tool } from "@/tools/shared/tool-utils"
import { ListExamPapersSchema } from "./schema"

export const handler = tool(ListExamPapersSchema, async (args, extra) => {
	const { userId } = extra.authInfo.extra

	console.log("[list-exam-papers] Handler invoked", { userId })

	// Fetch all exam papers from the database
	const allExamPapers = await db.examPaper.findMany({
		where: { is_active: true },
		include: {
			created_by: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			sections: {
				select: {
					id: true,
					title: true,
					total_marks: true,
				},
			},
		},
		orderBy: {
			created_at: "desc",
		},
	})

	console.log("[list-exam-papers] Successfully retrieved exam papers", {
		count: allExamPapers.length,
	})

	// Format the response as markdown
	let markdown = "# Exam Papers\n\n"
	markdown += `Found **${allExamPapers.length}** exam paper(s)\n\n`

	if (allExamPapers.length === 0) {
		markdown += "*No exam papers found.*\n"
		return markdown
	}

	allExamPapers.forEach((paper, index) => {
		markdown += `## ${index + 1}. ${paper.title}\n\n`
		markdown += `- **ID**: ${paper.id}\n`
		markdown += `- **Subject**: ${paper.subject}\n`
		markdown += `- **Year**: ${paper.year}\n`
		if (paper.paper_number) {
			markdown += `- **Paper Number**: ${paper.paper_number}\n`
		}
		if (paper.exam_board) {
			markdown += `- **Exam Board**: ${paper.exam_board}\n`
		}
		markdown += `- **Duration**: ${paper.duration_minutes} minutes\n`
		markdown += `- **Total Marks**: ${paper.total_marks}\n`
		markdown += `- **Created by**: ${paper.created_by.name || paper.created_by.email || "Unknown"}\n`
		markdown += `- **Created**: ${paper.created_at.toLocaleDateString()}\n`
		markdown += `- **Sections**: ${paper.sections.length}\n`

		const meta = (paper.metadata ?? {}) as Record<string, unknown>
		if (meta.difficulty_level) {
			markdown += `- **Difficulty**: ${meta.difficulty_level}\n`
		}
		const tier = paper.tier ?? meta.tier
		if (tier) {
			markdown += `- **Tier**: ${tier}\n`
		}
		if (meta.season) {
			markdown += `- **Season**: ${meta.season}\n`
		}

		markdown += "\n"
	})

	return markdown
})

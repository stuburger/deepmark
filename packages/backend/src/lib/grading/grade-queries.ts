import { db } from "@/db"
import type { ExamPaperWithSections } from "@/lib/grading/question-list"

/**
 * Loads the full exam paper structure needed for grading — sections, questions,
 * mark schemes (most recent), and question parts with their mark schemes.
 */
export async function loadExamPaperForGrading(
	examPaperId: string,
): Promise<ExamPaperWithSections> {
	return db.examPaper.findUniqueOrThrow({
		where: { id: examPaperId },
		include: {
			sections: {
				orderBy: { order: "asc" },
				include: {
					exam_section_questions: {
						orderBy: { order: "asc" },
						include: {
							question: {
								include: {
									mark_schemes: { take: 1, orderBy: { created_at: "desc" } },
									question_parts: {
										include: {
											mark_schemes: {
												take: 1,
												orderBy: { created_at: "desc" },
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	})
}

import type { Prisma } from "@mcp-gcse/db"

export type ExamPaperWithSections = Prisma.ExamPaperGetPayload<{
	include: {
		sections: {
			include: {
				exam_section_questions: {
					include: {
						question: {
							include: {
								mark_schemes: true
								question_stimuli: {
									include: { stimulus: true }
								}
							}
						}
					}
				}
			}
		}
	}
}>

export type QuestionObj =
	ExamPaperWithSections["sections"][number]["exam_section_questions"][number]["question"]

export type MarkScheme = QuestionObj["mark_schemes"][number]

export type QuestionListItem = {
	question_number: string
	question_id: string
	question_text: string
	mark_scheme: MarkScheme | null
	question_obj: QuestionObj
}

export type LoadQuestionListArgs = {
	examPaper: ExamPaperWithSections
}

/**
 * Flattens the nested exam paper sections/questions into a simple ordered list,
 * attaching the most recent mark scheme (if any) to each question.
 */
export function loadQuestionList(
	args: LoadQuestionListArgs,
): QuestionListItem[] {
	const { examPaper } = args
	const questionList: QuestionListItem[] = []
	let questionIndex = 1

	for (const section of examPaper.sections) {
		for (const esq of section.exam_section_questions) {
			const q = esq.question
			const ms = q.mark_schemes[0] ?? null
			// Use the canonical question number from the PDF (e.g. "1a", "2bii")
			// and fall back to sequential position only when none is stored.
			questionList.push({
				question_number: q.question_number ?? String(questionIndex),
				question_id: q.id,
				question_text: q.text,
				mark_scheme: ms,
				question_obj: q,
			})
			questionIndex++
		}
	}

	return questionList
}

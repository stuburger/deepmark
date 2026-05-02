/**
 * Pure validator that compares the LLM's inferred marks (`total_marks`) against
 * the literal printed values (`printed_marks` on questions, `printed_total_marks`
 * on sections + paper). Any null printed value is treated as "no signal" and skipped.
 *
 * Discrepancies do not fail extraction — they are persisted alongside the question
 * so the teacher can review and confirm via the exam-paper UI.
 */

export type MarksDiscrepancy =
	| {
			scope: "question"
			section_index: number
			question_index: number
			expected: number
			found: number
			message: string
	  }
	| {
			scope: "section"
			section_index: number
			expected: number
			found: number
			message: string
	  }
	| {
			scope: "paper"
			expected: number
			found: number
			message: string
	  }

type QuestionInput = {
	total_marks: number
	printed_marks: number | null
	question_number?: string | null
}

type SectionInput = {
	title: string
	total_marks: number
	printed_total_marks: number | null
	questions: QuestionInput[]
}

export type ValidateMarksInput = {
	sections: SectionInput[]
	paper_printed_total_marks: number | null
}

export function validateMarks(input: ValidateMarksInput): MarksDiscrepancy[] {
	const discrepancies: MarksDiscrepancy[] = []

	input.sections.forEach((section, section_index) => {
		section.questions.forEach((question, question_index) => {
			if (
				question.printed_marks !== null &&
				question.printed_marks !== question.total_marks
			) {
				const label = question.question_number ?? `#${question_index + 1}`
				discrepancies.push({
					scope: "question",
					section_index,
					question_index,
					expected: question.printed_marks,
					found: question.total_marks,
					message: `Question ${label}: paper prints (${question.printed_marks} marks) but extraction recorded ${question.total_marks}.`,
				})
			}
		})

		if (section.printed_total_marks !== null) {
			const summed = section.questions.reduce(
				(acc, q) => acc + q.total_marks,
				0,
			)
			if (section.printed_total_marks !== summed) {
				discrepancies.push({
					scope: "section",
					section_index,
					expected: section.printed_total_marks,
					found: summed,
					message: `${section.title}: paper prints ${section.printed_total_marks} marks but extracted questions sum to ${summed}.`,
				})
			}
		}
	})

	if (input.paper_printed_total_marks !== null) {
		const summed = input.sections.reduce(
			(acc, s) =>
				acc + s.questions.reduce((qacc, q) => qacc + q.total_marks, 0),
			0,
		)
		if (input.paper_printed_total_marks !== summed) {
			discrepancies.push({
				scope: "paper",
				expected: input.paper_printed_total_marks,
				found: summed,
				message: `Paper total: cover prints ${input.paper_printed_total_marks} marks but extracted questions sum to ${summed}.`,
			})
		}
	}

	return discrepancies
}

/**
 * Returns the warning string to attach to a question row, or null if no
 * discrepancy applies to that position. Section-scope and paper-scope
 * discrepancies attach to the first question of the relevant scope so the
 * warning surfaces somewhere in the UI without inventing a new entity.
 */
export function warningForQuestion(
	discrepancies: MarksDiscrepancy[],
	section_index: number,
	question_index: number,
): string | null {
	const messages: string[] = []

	for (const d of discrepancies) {
		if (
			d.scope === "question" &&
			d.section_index === section_index &&
			d.question_index === question_index
		) {
			messages.push(d.message)
		}
		if (
			d.scope === "section" &&
			d.section_index === section_index &&
			question_index === 0
		) {
			messages.push(d.message)
		}
		if (d.scope === "paper" && section_index === 0 && question_index === 0) {
			messages.push(d.message)
		}
	}

	return messages.length > 0 ? messages.join(" ") : null
}

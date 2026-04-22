import { db } from "@/db"

/**
 * Links all questions created by a job to the given exam paper's first section.
 * Creates the section if the paper has none yet.
 * Skips questions already linked to avoid unique constraint violations (idempotent).
 */
export async function linkJobQuestionsToExamPaper(
	jobId: string,
	examPaperId: string,
	uploadedBy: string,
): Promise<void> {
	const questions = await db.question.findMany({
		where: { source_pdf_ingestion_job_id: jobId },
		orderBy: { created_at: "asc" },
		select: { id: true },
	})
	if (questions.length === 0) return

	let section = await db.examSection.findFirst({
		where: { exam_paper_id: examPaperId },
		orderBy: { order: "asc" },
	})
	if (!section) {
		const paper = await db.examPaper.findUnique({
			where: { id: examPaperId },
			select: { total_marks: true },
		})
		section = await db.examSection.create({
			data: {
				exam_paper_id: examPaperId,
				title: "Section 1",
				total_marks: paper?.total_marks ?? 0,
				order: 1,
				created_by_id: uploadedBy,
			},
		})
	}

	const existingLinks = await db.examSectionQuestion.findMany({
		where: { exam_section_id: section.id },
		select: { question_id: true, order: true },
		orderBy: { order: "asc" },
	})
	const existingQuestionIds = new Set(existingLinks.map((l) => l.question_id))
	const maxOrder =
		existingLinks.length > 0
			? Math.max(...existingLinks.map((l) => l.order))
			: 0

	let orderOffset = maxOrder
	for (const q of questions) {
		if (existingQuestionIds.has(q.id)) continue
		orderOffset++
		await db.examSectionQuestion.create({
			data: {
				exam_section_id: section.id,
				question_id: q.id,
				order: orderOffset,
			},
		})
	}
}

/**
 * Per-section input for {@link linkJobQuestionsToExamPaperSections}.
 * Question IDs must already exist (the processor creates Question rows first,
 * then hands their IDs in here in paper order).
 */
export type LinkSectionInput = {
	title: string
	description?: string | null
	/** Question IDs in the order they appear within this section. */
	question_ids: string[]
	/**
	 * Optional per-section total. When omitted, the sum of the linked questions'
	 * `points` is used. Provided for callers that want the paper's printed total
	 * (e.g. "Mark for Section A / 25") to win even if rounding drifts.
	 */
	total_marks?: number
}

/**
 * Links questions to an exam paper using the LLM-reported section structure.
 * One `ExamSection` is created per input entry; questions are linked in the
 * order they appear within each section's `question_ids`.
 *
 * Idempotent: if a section with the same `(exam_paper_id, title)` already
 * exists (same paper re-ingested), it's reused. Existing links on a section
 * are preserved — new questions are appended after the current max order.
 */
export async function linkJobQuestionsToExamPaperSections(
	examPaperId: string,
	uploadedBy: string,
	sections: LinkSectionInput[],
): Promise<void> {
	if (sections.length === 0) return

	const allQuestionIds = sections.flatMap((s) => s.question_ids)
	if (allQuestionIds.length === 0) return

	const questionPoints = new Map<string, number>(
		(
			await db.question.findMany({
				where: { id: { in: allQuestionIds } },
				select: { id: true, points: true },
			})
		).map((q) => [q.id, q.points ?? 0]),
	)

	const existingSections = await db.examSection.findMany({
		where: { exam_paper_id: examPaperId },
		orderBy: { order: "asc" },
	})
	const existingByTitle = new Map(existingSections.map((s) => [s.title, s]))
	let maxSectionOrder = existingSections.reduce(
		(m, s) => Math.max(m, s.order),
		0,
	)

	for (const input of sections) {
		const sumPoints = input.question_ids.reduce(
			(acc, id) => acc + (questionPoints.get(id) ?? 0),
			0,
		)
		const sectionTotal = input.total_marks ?? sumPoints

		let section = existingByTitle.get(input.title)
		if (!section) {
			maxSectionOrder++
			section = await db.examSection.create({
				data: {
					exam_paper_id: examPaperId,
					title: input.title,
					description: input.description ?? null,
					total_marks: sectionTotal,
					order: maxSectionOrder,
					created_by_id: uploadedBy,
				},
			})
			existingByTitle.set(section.title, section)
		}

		const existingLinks = await db.examSectionQuestion.findMany({
			where: { exam_section_id: section.id },
			select: { question_id: true, order: true },
		})
		const existingQuestionIds = new Set(existingLinks.map((l) => l.question_id))
		let orderOffset = existingLinks.reduce((m, l) => Math.max(m, l.order), 0)

		for (const questionId of input.question_ids) {
			if (existingQuestionIds.has(questionId)) continue
			orderOffset++
			await db.examSectionQuestion.create({
				data: {
					exam_section_id: section.id,
					question_id: questionId,
					order: orderOffset,
				},
			})
		}
	}
}

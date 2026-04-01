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

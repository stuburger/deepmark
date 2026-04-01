import { db } from "@/db"
import { parseMarkPointsFromPrisma } from "@mcp-gcse/shared"
import type { QuestionWithMarkScheme } from "@mcp-gcse/shared"

export function buildQuestionWithMarkScheme(
	questionId: string,
	questionText: string,
	topic: string,
	questionType: string,
	markPointsPrisma: Array<{
		point_number: number
		description: string
		points: number
		criteria: string
	}>,
	totalPoints: number,
	guidance: string | undefined,
	rubric: string,
	correctOptionLabels: string[],
	markingMethod?: "deterministic" | "point_based" | "level_of_response",
	markingRules?: {
		command_word?: string
		items_required?: number
		levels: Array<{
			level: number
			mark_range: [number, number]
			descriptor: string
			ao_requirements?: string[]
		}>
		caps?: Array<{
			condition: string
			max_level?: number
			max_mark?: number
			reason: string
		}>
	} | null,
): QuestionWithMarkScheme {
	const markPoints = parseMarkPointsFromPrisma(markPointsPrisma)
	return {
		id: questionId,
		questionType:
			questionType === "multiple_choice" ? "multiple_choice" : "written",
		questionText,
		topic,
		rubric,
		guidance: guidance ?? null,
		totalPoints,
		markPoints,
		correctOptionLabels:
			correctOptionLabels.length > 0 ? correctOptionLabels : undefined,
		availableOptions: undefined,
		markingMethod: markingMethod ?? undefined,
		markingRules: markingRules ?? undefined,
	}
}

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

import { linkJobQuestionsToExamPaper } from "@/lib/grading/link-job-questions"
import { parseMarkPointsFromPrisma } from "@mcp-gcse/shared"
import type { QuestionWithMarkScheme } from "@mcp-gcse/shared"

export { linkJobQuestionsToExamPaper }

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

import type { MarkPointResultGrade, QuestionWithMarkScheme } from "./types"

/**
 * Compute score metrics from LLM grading output.
 * Extracted as a pure function to avoid duplication across grading methods.
 */
export function computeGradeMetrics(
	aiGrade: {
		markPointsResults: MarkPointResultGrade[]
		totalScore: number
	},
	question: QuestionWithMarkScheme,
): {
	totalScore: number
	maxPossibleScore: number
	scorePercentage: number
	passed: boolean
} {
	const rawScore = aiGrade.markPointsResults
		.filter((mp) => mp.awarded)
		.reduce(
			(sum, mp) =>
				sum +
				(question.markPoints.find((p) => p.pointNumber === mp.pointNumber)
					?.points ?? 0),
			0,
		)

	const maxPossibleScore = question.totalPoints
	const totalScore = Math.min(rawScore, maxPossibleScore)
	const scorePercentage =
		maxPossibleScore > 0
			? Math.round((totalScore / maxPossibleScore) * 100)
			: 0

	const requiredMarkPoints = question.markPoints.filter((mp) => mp.isRequired)
	const passed =
		requiredMarkPoints.length === 0 ||
		requiredMarkPoints.every((reqMp) => {
			const result = aiGrade.markPointsResults.find(
				(r) => r.pointNumber === reqMp.pointNumber,
			)
			return result?.awarded === true
		})

	return { totalScore, maxPossibleScore, scorePercentage, passed }
}

import type { McqQuestionGrade, QuestionWithMarkScheme } from "../grading/types"
import type { Marker, MarkerContext } from "./marker"

/**
 * Extract selected option letters from a noisy student answer string.
 *
 * OCR/attribution is told to return only letters (e.g. "D" or "AB" for
 * multi-select), but occasionally the option text bleeds through —
 * "D Allows the customisation of products". Stripping all non-letters and
 * splitting would explode that into [A,A,C,D,F,H,I,L,L,M,N,O,...] and zero
 * the question. Instead, take only the leading uppercase letter run (1–5
 * letters), bounded by a non-letter or end-of-string. Mixed-case words like
 * "Plc" / "Ltd" are not all-uppercase and won't match the leading run.
 */
function parseSelectedOptionLabels(answer: string): string[] {
	const upper = answer.trim().toUpperCase()
	const match = upper.match(/^[A-Z]{1,5}(?=$|[^A-Z])/)
	if (!match) return []
	return [...new Set(match[0].split(""))].sort()
}

/**
 * Deterministic marker for multiple_choice questions when correctOptionLabels are known.
 * Compares student-selected option letters to the correct set; no LLM.
 */
export class DeterministicMarker implements Marker {
	canMark(question: QuestionWithMarkScheme, _answer: string): boolean {
		if (question.questionType !== "multiple_choice") return false
		const labels = question.correctOptionLabels
		return Array.isArray(labels) && labels.length > 0
	}

	async mark(
		question: QuestionWithMarkScheme,
		answer: string,
		_context?: MarkerContext,
	): Promise<McqQuestionGrade> {
		const correctOptionLabels = question.correctOptionLabels
		if (
			!correctOptionLabels ||
			correctOptionLabels.length === 0 ||
			question.questionType !== "multiple_choice"
		) {
			throw new Error(
				`DeterministicMarker cannot grade question ${question.id}: not multiple_choice or missing correctOptionLabels`,
			)
		}

		const studentSelected = parseSelectedOptionLabels(answer)
		const correct = [...correctOptionLabels].map((l) => l.toUpperCase()).sort()

		const isCorrect =
			studentSelected.length === correct.length &&
			studentSelected.every((opt) => correct.includes(opt))

		const totalScore = isCorrect ? question.totalPoints : 0
		const maxPossibleScore = question.totalPoints
		const scorePercentage =
			maxPossibleScore > 0
				? Math.round((totalScore / maxPossibleScore) * 100)
				: 0

		const markPointsResults = question.markPoints.map((mp) => ({
			pointNumber: mp.pointNumber,
			awarded: isCorrect,
			reasoning: isCorrect
				? `Student selected [${studentSelected.join(", ")}], which matches the correct answer [${correct.join(", ")}].`
				: `Student selected [${studentSelected.join(", ")}]; correct answer is [${correct.join(", ")}].`,
			expectedCriteria: `Must select exactly: ${correct.join(", ")}`,
			studentCovered:
				studentSelected.length > 0
					? `Selected: ${studentSelected.join(", ")}`
					: "No options selected",
		}))

		const requiredMarkPoints = question.markPoints.filter((mp) => mp.isRequired)
		const passed =
			requiredMarkPoints.length === 0 ||
			requiredMarkPoints.every((reqMp) =>
				markPointsResults.some(
					(r) => r.pointNumber === reqMp.pointNumber && r.awarded,
				),
			)

		const optionBreakdown =
			question.availableOptions && question.availableOptions.length > 0
				? question.availableOptions
						.map((opt) => {
							const selected = studentSelected.includes(
								opt.optionLabel.toUpperCase(),
							)
							const shouldSelect = correct.includes(
								opt.optionLabel.toUpperCase(),
							)
							let status: string
							if (selected && shouldSelect) status = "Correctly selected"
							else if (selected && !shouldSelect)
								status = "Incorrectly selected"
							else if (!selected && shouldSelect)
								status = "Should have been selected"
							else status = "Correctly not selected"
							return `${opt.optionLabel}: ${opt.optionText} - ${status}`
						})
						.join("\n")
				: ""

		const feedbackSummary = isCorrect
			? `Correct. You selected all the right options. Score: ${totalScore}/${maxPossibleScore}`
			: `Incorrect. The correct options are: ${correct.join(", ")}. Score: ${totalScore}/${maxPossibleScore}${optionBreakdown ? `\n\nOption breakdown:\n${optionBreakdown}` : ""}`

		return {
			markingMethod: "deterministic",
			questionId: question.id,
			markPointsResults,
			totalScore,
			maxPossibleScore,
			scorePercentage,
			passed,
			llmReasoning: `Deterministic MCQ: student [${studentSelected.join(", ")}], correct [${correct.join(", ")}]. ${isCorrect ? "Full marks." : "Zero marks."}`,
			feedbackSummary,
			correctAnswer: correct.join(", "),
			relevantLearningSnippet: "",
			whatWentWell: isCorrect ? ["Correct option selected"] : [],
			whatDidntGoWell: isCorrect ? [] : ["Wrong option selected"],
		}
	}
}

import { type LanguageModel, generateText } from "ai"
import type { Grader } from "../grading/grader"
import type { QuestionGrade, QuestionWithMarkScheme } from "../grading/types"
import type { AdversarialLoopOptions, TestRunResult } from "./types"

const DEFAULT_MAX_ITERATIONS = 3

const STUDENT_SYSTEM_PROMPT = `You are a student taking a GCSE exam. Your goal is to write an answer that will receive exactly a specific number of marks when marked against the given mark scheme.

- Write in the style of a real student: clear but not overly polished.
- Target the exact mark count you are given. Do not over-answer or under-answer.
- If the target is low, write a brief answer that touches only enough criteria for that score.
- If the target is high, write a fuller answer that clearly satisfies the required mark points.
- Return only the answer text, no meta-commentary.`

/**
 * Run the adversarial loop: student agent produces answers targeting specific scores;
 * grader marks them. Returns one TestRunResult per iteration (caller persists as MarkSchemeTestRun).
 */
export async function runAdversarialLoop(
	question: QuestionWithMarkScheme,
	grader: Grader,
	studentModel: LanguageModel,
	options: AdversarialLoopOptions,
): Promise<TestRunResult[]> {
	const targetScores = options.targetScores
	const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS
	const results: TestRunResult[] = []
	const totalPoints = question.totalPoints

	for (const targetScore of targetScores) {
		let previousReasoning: string | undefined
		for (let iteration = 1; iteration <= maxIterations; iteration++) {
			const prompt = buildStudentPrompt(
				question,
				targetScore,
				totalPoints,
				previousReasoning,
			)
			const { text: studentAnswer } = await generateText({
				model: studentModel,
				system: STUDENT_SYSTEM_PROMPT,
				prompt,
			})

			const grade: QuestionGrade = await grader.gradeSingleResponse({
				question,
				answer: studentAnswer.trim(),
			})

			const actualScore = grade.totalScore
			const delta = actualScore - targetScore
			const converged = delta === 0

			results.push({
				iteration,
				targetScore,
				actualScore,
				delta,
				studentAnswer: studentAnswer.trim(),
				graderReasoning: grade.llmReasoning,
				converged,
			})

			previousReasoning = grade.llmReasoning
			if (converged) break
		}
	}

	return results
}

function buildStudentPrompt(
	question: QuestionWithMarkScheme,
	targetScore: number,
	totalPoints: number,
	previousReasoning?: string,
): string {
	const markPointsDesc = question.markPoints
		.map(
			(mp) =>
				`[${mp.pointNumber}] ${mp.description} (${mp.points} mark${mp.points > 1 ? "s" : ""}): ${mp.criteria}`,
		)
		.join("\n")

	let prompt = `Question (total ${totalPoints} marks):
${question.questionText}

Mark scheme:
${question.rubric}
${question.guidance ? `\nGuidance: ${question.guidance}\n` : ""}

Mark points:
${markPointsDesc}

Write a student answer that should receive exactly **${targetScore}** out of ${totalPoints} marks when marked against this scheme. Return only the answer.`

	if (previousReasoning) {
		prompt += `\n\n(Previous attempt was marked with this reasoning — use it to adjust so you land on ${targetScore} marks:\n${previousReasoning})`
	}

	return prompt
}

/**
 * Suggest score boundaries to probe for a given total (e.g. [1, 25%, 50%, 75%, max]).
 */
export function probeBoundaries(totalPoints: number): number[] {
	if (totalPoints <= 0) return [0]
	const step = Math.max(1, Math.floor(totalPoints / 4))
	const scores: number[] = [1]
	for (let s = step; s < totalPoints; s += step) {
		scores.push(s)
	}
	if (totalPoints > 1 && !scores.includes(totalPoints)) {
		scores.push(totalPoints)
	}
	return [...new Set(scores)].sort((a, b) => a - b)
}

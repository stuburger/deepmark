"use server"

import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createPrismaClient } from "@mcp-gcse/db"
import {
	DeterministicMarker,
	Grader,
	LevelOfResponseMarker,
	LlmMarker,
	MarkerOrchestrator,
	type QuestionWithMarkScheme,
	parseMarkPointsFromPrisma,
	parseMarkingRulesFromPrisma,
} from "@mcp-gcse/shared"
import { Resource } from "sst"
import { auth } from "./auth"
import { log } from "./logger"

const TAG = "eval-actions"
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

export type EvalMarkPoint = {
	description: string
	awarded: boolean
	reason: string
}

export type EvalResult = {
	score: number
	max_score: number
	reasoning: string
	awarded_points: EvalMarkPoint[]
}

export type EvaluateStudentAnswerResult =
	| { ok: true; result: EvalResult }
	| { ok: false; error: string }

/**
 * Grades a student answer against the mark scheme using the shared MarkerOrchestrator.
 *
 * Marker priority:
 *   1. DeterministicMarker — MCQ questions, no LLM call.
 *   2. LevelOfResponseMarker — LoR questions, uses AQA-style level descriptors.
 *   3. LlmMarker — written/point_based fallback.
 *
 * Nothing is persisted — this is purely for in-browser testing.
 */
export async function evaluateStudentAnswer(
	questionId: string,
	studentAnswer: string,
): Promise<EvaluateStudentAnswerResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	if (!studentAnswer.trim()) {
		return { ok: false, error: "Student answer cannot be empty" }
	}

	log.info(TAG, "evaluateStudentAnswer called", {
		userId: session.userId,
		questionId,
	})

	try {
		const question = await db.question.findUnique({
			where: { id: questionId },
			select: {
				id: true,
				text: true,
				topic: true,
				question_type: true,
				multiple_choice_options: true,
				mark_schemes: {
					take: 1,
					orderBy: { created_at: "asc" },
					select: {
						description: true,
						guidance: true,
						points_total: true,
						marking_method: true,
						mark_points: true,
						marking_rules: true,
						correct_option_labels: true,
					},
				},
			},
		})

		if (!question) return { ok: false, error: "Question not found" }

		const markScheme = question.mark_schemes[0]
		if (!markScheme) {
			return { ok: false, error: "No mark scheme available for this question" }
		}

		const markPoints = parseMarkPointsFromPrisma(markScheme.mark_points)
		const markingRules = parseMarkingRulesFromPrisma(markScheme.marking_rules)

		type RawOption = { option_label: string; option_text: string }
		const availableOptions = Array.isArray(question.multiple_choice_options)
			? (question.multiple_choice_options as RawOption[]).map((opt) => ({
					optionLabel: opt.option_label,
					optionText: opt.option_text,
				}))
			: undefined

		const questionWithMarkScheme: QuestionWithMarkScheme = {
			id: question.id,
			questionType:
				question.question_type === "multiple_choice"
					? "multiple_choice"
					: "written",
			questionText: question.text,
			topic: question.topic,
			rubric: markScheme.description,
			guidance: markScheme.guidance,
			totalPoints: markScheme.points_total,
			markPoints,
			markingMethod: markScheme.marking_method as
				| "deterministic"
				| "point_based"
				| "level_of_response",
			correctOptionLabels:
				markScheme.correct_option_labels.length > 0
					? markScheme.correct_option_labels
					: undefined,
			availableOptions,
			markingRules,
		}

		const gemini = createGoogleGenerativeAI({
			apiKey: Resource.GeminiApiKey.value,
		})

		const grader = new Grader(gemini("gemini-2.5-flash"), {
			systemPrompt:
				"You are an expert GCSE examiner. Mark the student's answer against the provided mark scheme. Return valid JSON matching the schema. Be consistent and conservative: only award marks when there is clear evidence.",
		})

		const orchestrator = new MarkerOrchestrator([
			new DeterministicMarker(),
			new LevelOfResponseMarker(grader),
			new LlmMarker(grader),
		])

		const grade = await orchestrator.mark(questionWithMarkScheme, studentAnswer)

		const evalResult: EvalResult = {
			score: grade.totalScore,
			max_score: grade.maxPossibleScore,
			reasoning: grade.feedbackSummary,
			awarded_points: grade.markPointsResults.map((mpr) => {
				const mp = markPoints.find((p) => p.pointNumber === mpr.pointNumber)
				return {
					description: mp?.description ?? `Mark point ${mpr.pointNumber}`,
					awarded: mpr.awarded,
					reason: mpr.reasoning,
				}
			}),
		}

		log.info(TAG, "Evaluation complete", {
			userId: session.userId,
			questionId,
			score: evalResult.score,
			max_score: evalResult.max_score,
			marking_method: markScheme.marking_method,
		})

		return { ok: true, result: evalResult }
	} catch (err) {
		log.error(TAG, "evaluateStudentAnswer failed", {
			userId: session.userId,
			questionId,
			error: String(err),
		})
		return { ok: false, error: "Evaluation failed. Please try again." }
	}
}

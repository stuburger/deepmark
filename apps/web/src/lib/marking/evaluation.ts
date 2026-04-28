"use server"

import { db } from "@/lib/db"
import {
	DeterministicMarker,
	Grader,
	LevelOfResponseMarker,
	LlmMarker,
	MarkerOrchestrator,
	type QuestionWithMarkScheme,
	parseMarkPointsFromPrisma,
} from "@mcp-gcse/shared"
import { z } from "zod/v4"
import { auth } from "../auth"
import { log } from "../logger"
import type { MarkSchemeInput } from "../mark-scheme/types"

const TAG = "eval-actions"

const markSchemeInputSchema = z.discriminatedUnion("marking_method", [
	z.object({
		marking_method: z.literal("point_based"),
		description: z.string().trim().min(1, "Description is required"),
		guidance: z.string().trim().nullable().optional(),
		mark_points: z
			.array(
				z.object({
					criteria: z.string().trim().min(1, "Mark point criteria is required"),
					description: z.string().optional(),
					points: z.number().int().min(0, "Mark point value is invalid"),
				}),
			)
			.min(1, "At least one mark point is required"),
	}),
	z.object({
		marking_method: z.literal("deterministic"),
		description: z.string().trim().min(1, "Description is required"),
		guidance: z.string().trim().nullable().optional(),
		correct_option_labels: z
			.array(z.string())
			.min(1, "Select at least one correct answer"),
	}),
	z.object({
		marking_method: z.literal("level_of_response"),
		description: z.string().trim().min(1, "Description is required"),
		guidance: z.string().trim().nullable().optional(),
		content: z.string().trim().min(1, "Mark scheme content is required"),
		points_total: z.number().int().positive("Cannot determine total marks"),
	}),
])

type ParsedMarkSchemeInput = z.infer<typeof markSchemeInputSchema>

type EvaluationMarkScheme = {
	description: string
	guidance: string | null
	points_total: number
	marking_method: "deterministic" | "point_based" | "level_of_response"
	mark_points: unknown
	content: string | null
	correct_option_labels: string[]
}

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
	markSchemeDraft?: MarkSchemeInput | null,
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
						content: true,
						correct_option_labels: true,
					},
				},
			},
		})

		if (!question) return { ok: false, error: "Question not found" }

		const markScheme = question.mark_schemes[0]
		if (!markScheme && !markSchemeDraft) {
			return { ok: false, error: "No mark scheme available for this question" }
		}

		const selectedMarkScheme = markSchemeDraft
			? parseDraftMarkScheme(markSchemeDraft)
			: markScheme
				? toEvaluationMarkScheme(markScheme)
				: null

		if (!selectedMarkScheme) {
			return { ok: false, error: getDraftMarkSchemeError(markSchemeDraft) }
		}

		const markPoints = parseMarkPointsFromPrisma(selectedMarkScheme.mark_points)

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
			rubric: selectedMarkScheme.description,
			guidance: selectedMarkScheme.guidance,
			totalPoints: selectedMarkScheme.points_total,
			markPoints,
			markingMethod: selectedMarkScheme.marking_method,
			correctOptionLabels:
				selectedMarkScheme.correct_option_labels.length > 0
					? selectedMarkScheme.correct_option_labels
					: undefined,
			availableOptions,
			content: selectedMarkScheme.content,
		}

		const { getDefaultRunner } = await import("@/lib/llm-runtime")
		const grader = new Grader(getDefaultRunner(), {
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
					description:
						mp?.criteria || mp?.description || `Mark point ${mpr.pointNumber}`,
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
			marking_method: selectedMarkScheme.marking_method,
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

function parseDraftMarkScheme(
	input: MarkSchemeInput,
): EvaluationMarkScheme | null {
	const parsed = markSchemeInputSchema.safeParse(input)
	if (!parsed.success) return null
	const draft: ParsedMarkSchemeInput = parsed.data

	if (draft.marking_method === "deterministic") {
		return {
			description: draft.description,
			guidance: draft.guidance || null,
			points_total: 1,
			marking_method: "deterministic",
			mark_points: [],
			content: null,
			correct_option_labels: draft.correct_option_labels,
		}
	}

	if (draft.marking_method === "level_of_response") {
		return {
			description: draft.description,
			guidance: draft.guidance || null,
			points_total: draft.points_total,
			marking_method: "level_of_response",
			mark_points: [],
			content: draft.content,
			correct_option_labels: [],
		}
	}

	return {
		description: draft.description,
		guidance: draft.guidance || null,
		points_total: draft.mark_points.reduce((sum, mp) => sum + mp.points, 0),
		marking_method: "point_based",
		mark_points: draft.mark_points.map((mp, index) => ({
			point_number: index + 1,
			criteria: mp.criteria,
			description: mp.description ?? "",
			points: mp.points,
		})),
		content: null,
		correct_option_labels: [],
	}
}

function getDraftMarkSchemeError(input: MarkSchemeInput | null | undefined) {
	if (!input) return "No mark scheme available for this question"
	const parsed = markSchemeInputSchema.safeParse(input)
	if (parsed.success) return "No mark scheme available for this question"
	return parsed.error.issues[0]?.message ?? "Mark scheme draft is invalid"
}

function toEvaluationMarkScheme(markScheme: {
	description: string
	guidance: string | null
	points_total: number
	marking_method: "deterministic" | "point_based" | "level_of_response"
	mark_points: unknown
	content: string | null
	correct_option_labels: string[]
}): EvaluationMarkScheme {
	return {
		description: markScheme.description,
		guidance: markScheme.guidance,
		points_total: markScheme.points_total,
		marking_method: markScheme.marking_method,
		mark_points: markScheme.mark_points,
		content: markScheme.content,
		correct_option_labels: markScheme.correct_option_labels,
	}
}

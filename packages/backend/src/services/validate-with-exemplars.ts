import { db } from "@/db"
import { defaultChatModel } from "@/lib/infra/google-generative-ai"
import {
	Grader,
	type QuestionWithMarkScheme,
	parseMarkPointsFromPrisma,
	parseMarkingRulesFromPrisma,
} from "@mcp-gcse/shared"

export interface ExemplarValidationSummary {
	markSchemeId: string
	totalTested: number
	passCount: number
	accuracyPercent: number
}

function buildQuestionWithMarkScheme(markScheme: {
	id: string
	description: string
	guidance: string | null
	points_total: number
	mark_points: unknown
	marking_method: string
	marking_rules: unknown
	correct_option_labels: string[]
	question: {
		id: string
		text: string
		topic: string
		question_type: string
		multiple_choice_options: unknown
	}
	question_part: {
		id: string
		text: string
		part_label: string
		question_type: string
		multiple_choice_options: unknown
	} | null
}): QuestionWithMarkScheme {
	const q = markScheme.question
	const part = markScheme.question_part
	const questionText = part ? q.text + part.text : q.text
	const questionType = (part ? part.question_type : q.question_type) as
		| "written"
		| "multiple_choice"
	const rawOptions = (part?.multiple_choice_options ??
		q.multiple_choice_options) as
		| Array<{ option_label: string; option_text: string }>
		| null
		| undefined
	const availableOptions = Array.isArray(rawOptions)
		? rawOptions.map((o) => ({
				optionLabel: o.option_label,
				optionText: o.option_text,
			}))
		: undefined

	return {
		id: part?.id ?? q.id,
		questionType,
		questionText,
		topic: q.topic,
		rubric: markScheme.description,
		guidance: markScheme.guidance ?? null,
		totalPoints: markScheme.points_total,
		markPoints: parseMarkPointsFromPrisma(markScheme.mark_points),
		correctOptionLabels:
			markScheme.correct_option_labels?.length > 0
				? markScheme.correct_option_labels
				: undefined,
		availableOptions,
		markingMethod:
			(markScheme.marking_method as
				| "deterministic"
				| "point_based"
				| "level_of_response") ?? undefined,
		markingRules: parseMarkingRulesFromPrisma(markScheme.marking_rules),
	}
}

/**
 * Validates a mark scheme against all linked exemplar answers that have an expected_score.
 * For each exemplar, grades the answer and stores a MarkSchemeTestRun with triggered_by: "exemplar_validation".
 * Returns a summary of accuracy (within ±1 mark counts as a pass).
 */
export async function validateWithExemplars(
	markSchemeId: string,
): Promise<ExemplarValidationSummary> {
	const markScheme = await db.markScheme.findUniqueOrThrow({
		where: { id: markSchemeId },
		include: {
			question: {
				select: {
					id: true,
					text: true,
					topic: true,
					question_type: true,
					multiple_choice_options: true,
				},
			},
			question_part: {
				select: {
					id: true,
					text: true,
					part_label: true,
					question_type: true,
					multiple_choice_options: true,
				},
			},
		},
	})

	const exemplars = await db.exemplarAnswer.findMany({
		where: {
			expected_score: { not: null },
			OR: [
				{ mark_scheme_id: markSchemeId },
				{ question_id: markScheme.question_id },
			],
		},
	})

	if (exemplars.length === 0) {
		return { markSchemeId, totalTested: 0, passCount: 0, accuracyPercent: 0 }
	}

	const grader = new Grader(defaultChatModel(), {
		systemPrompt:
			"You are an expert GCSE examiner. Mark the student's answer against the provided mark scheme. Return valid JSON matching the schema. Be consistent and conservative.",
	})

	const questionWithScheme = buildQuestionWithMarkScheme(markScheme)
	const isLoR = markScheme.marking_method === "level_of_response"

	let passCount = 0

	for (const exemplar of exemplars) {
		try {
			const grade = isLoR
				? await grader.gradeSingleResponseLoR({
						question: questionWithScheme,
						answer: exemplar.answer_text,
					})
				: await grader.gradeSingleResponse({
						question: questionWithScheme,
						answer: exemplar.answer_text,
					})

			const targetScore = exemplar.expected_score ?? 0
			const actualScore = grade.totalScore
			const delta = actualScore - targetScore
			const converged = Math.abs(delta) <= 1

			if (converged) passCount++

			await db.markSchemeTestRun.create({
				data: {
					mark_scheme_id: markSchemeId,
					iteration: 0,
					target_score: targetScore,
					actual_score: actualScore,
					delta,
					student_answer: exemplar.answer_text,
					grader_reasoning: grade.llmReasoning,
					schema_patch: null,
					converged,
					triggered_by: "exemplar_validation",
					exemplar_id: exemplar.id,
				},
			})
		} catch (err) {
			console.error(
				`Failed to grade exemplar ${exemplar.id} against mark scheme ${markSchemeId}:`,
				err,
			)
		}
	}

	const totalTested = exemplars.length
	const accuracyPercent =
		totalTested > 0 ? Math.round((passCount / totalTested) * 100) : 0

	return { markSchemeId, totalTested, passCount, accuracyPercent }
}

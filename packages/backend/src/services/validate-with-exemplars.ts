import { db } from "@/db"
import { getLlmConfig } from "@/lib/infra/llm-config"
import { resolveModel } from "@/lib/infra/llm-runtime"
import { Grader, buildQuestionWithMarkScheme } from "@mcp-gcse/shared"

export interface ExemplarValidationSummary {
	markSchemeId: string
	totalTested: number
	passCount: number
	accuracyPercent: number
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

	const config = await getLlmConfig("grading")
	const models = config.map(resolveModel)
	const grader = new Grader(models, {
		systemPrompt:
			"You are an expert GCSE examiner. Mark the student's answer against the provided mark scheme. Return valid JSON matching the schema. Be consistent and conservative.",
	})

	const q = markScheme.question
	const questionWithScheme = buildQuestionWithMarkScheme({
		questionId: q.id,
		questionText: q.text,
		topic: q.topic,
		questionType: q.question_type,
		multipleChoiceOptions: q.multiple_choice_options,
		markScheme: {
			description: markScheme.description,
			guidance: markScheme.guidance,
			pointsTotal: markScheme.points_total,
			markPoints: markScheme.mark_points,
			markingMethod: markScheme.marking_method,
			markingRules: markScheme.marking_rules,
			correctOptionLabels: markScheme.correct_option_labels,
		},
	})
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

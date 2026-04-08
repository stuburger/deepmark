import { db } from "@/db"
import { defaultChatModel } from "@/lib/infra/google-generative-ai"
import {
	type Grader,
	buildQuestionWithMarkScheme,
	probeBoundaries,
	runAdversarialLoop,
} from "@mcp-gcse/shared"

/**
 * Runs the adversarial test loop for a mark scheme and persists the results.
 * Generates synthetic student answers at probe score boundaries, grades them,
 * and stores each iteration in markSchemeTestRun.
 */
export async function runAndPersistAdversarialTests(args: {
	markSchemeId: string
	questionId: string
	questionText: string
	topic: string
	questionType: string
	pointsTotal: number
	markPointsPrisma: unknown
	effectiveMarkingMethod: string
	markingRules: unknown
	correctOptionLabels: string[]
	aoDescription: string
	guidance: string | null | undefined
	grader: Grader
}): Promise<void> {
	const questionWithScheme = buildQuestionWithMarkScheme({
		questionId: args.questionId,
		questionText: args.questionText,
		topic: args.topic,
		questionType: args.questionType,
		markScheme: {
			description: args.aoDescription,
			guidance: args.guidance,
			pointsTotal: args.pointsTotal,
			markPoints: args.markPointsPrisma,
			markingMethod: args.effectiveMarkingMethod,
			markingRules: args.markingRules ?? null,
			correctOptionLabels: args.correctOptionLabels,
		},
	})

	const testResults = await runAdversarialLoop(
		questionWithScheme,
		args.grader,
		defaultChatModel(),
		{
			targetScores: probeBoundaries(args.pointsTotal),
			maxIterations: 3,
		},
	)

	for (const tr of testResults) {
		await db.markSchemeTestRun.create({
			data: {
				mark_scheme_id: args.markSchemeId,
				iteration: tr.iteration,
				target_score: tr.targetScore,
				actual_score: tr.actualScore,
				delta: tr.delta,
				student_answer: tr.studentAnswer,
				grader_reasoning: tr.graderReasoning,
				schema_patch: tr.schemaPatch ?? null,
				converged: tr.converged,
				triggered_by: "pdf_pipeline",
			},
		})
	}

	await db.markScheme.update({
		where: { id: args.markSchemeId },
		data: {
			refined_at: new Date(),
			refinement_iterations: testResults.length,
		},
	})
}

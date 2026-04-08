import { db } from "@/db"
import { defaultChatModel } from "@/lib/infra/google-generative-ai"
import { tool } from "@/tools/shared/tool-utils"
import {
	Grader,
	buildQuestionWithMarkScheme,
	probeBoundaries,
	runAdversarialLoop,
} from "@mcp-gcse/shared"
import { TestAndRefineMarkSchemeSchema } from "./schema"

export const handler = tool(TestAndRefineMarkSchemeSchema, async (args) => {
	const { mark_scheme_id, target_scores, max_iterations = 3 } = args

	const markScheme = await db.markScheme.findUniqueOrThrow({
		where: { id: mark_scheme_id },
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

	const scores = target_scores ?? probeBoundaries(markScheme.points_total)
	const grader = new Grader(defaultChatModel(), {
		systemPrompt:
			"You are an expert GCSE examiner. Mark the student's answer against the provided mark scheme. Return valid JSON matching the schema. Be consistent and conservative.",
	})

	const testResults = await runAdversarialLoop(
		questionWithScheme,
		grader,
		defaultChatModel(),
		{ targetScores: scores, maxIterations: max_iterations },
	)

	for (const tr of testResults) {
		await db.markSchemeTestRun.create({
			data: {
				mark_scheme_id,
				iteration: tr.iteration,
				target_score: tr.targetScore,
				actual_score: tr.actualScore,
				delta: tr.delta,
				student_answer: tr.studentAnswer,
				grader_reasoning: tr.graderReasoning,
				schema_patch: tr.schemaPatch ?? null,
				converged: tr.converged,
				triggered_by: "mcp",
			},
		})
	}

	await db.markScheme.update({
		where: { id: mark_scheme_id },
		data: {
			refined_at: new Date(),
			refinement_iterations: testResults.length,
		},
	})

	const convergedCount = testResults.filter((r) => r.converged).length
	const summary = [
		`Test-and-refine completed for mark scheme ${mark_scheme_id}.`,
		`Ran ${testResults.length} iterations across target scores: ${scores.join(", ")}.`,
		`Converged: ${convergedCount}/${testResults.length}.`,
		testResults.length > 0
			? `Deltas: ${testResults.map((r) => `target ${r.targetScore} → actual ${r.actualScore} (Δ${r.delta})`).join("; ")}.`
			: "",
	].join(" ")

	return summary
})

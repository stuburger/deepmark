import { db } from "@/db"
import { getLlmConfig } from "@/lib/infra/llm-config"
import { createLlmRunner, resolveModel } from "@/lib/infra/llm-runtime"
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
					question_stimuli: {
						orderBy: { order: "asc" },
						select: {
							stimulus: {
								select: { label: true, content: true, content_type: true },
							},
						},
					},
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
		stimuli: q.question_stimuli.map((qs) => ({
			label: qs.stimulus.label,
			content: qs.stimulus.content,
			content_type: qs.stimulus.content_type,
		})),
		markScheme: {
			description: markScheme.description,
			guidance: markScheme.guidance,
			pointsTotal: markScheme.points_total,
			markPoints: markScheme.mark_points,
			markingMethod: markScheme.marking_method,
			content: markScheme.content,
			correctOptionLabels: markScheme.correct_option_labels,
		},
	})

	const scores = target_scores ?? probeBoundaries(markScheme.points_total)
	const llm = createLlmRunner()
	const grader = new Grader(llm, {
		systemPrompt:
			"You are an expert GCSE examiner. Mark the student's answer against the provided mark scheme. Return valid JSON matching the schema. Be consistent and conservative.",
	})

	// Adversarial student agent needs a raw LanguageModel
	const studentConfig = await getLlmConfig("test-dataset-generation")
	const testResults = await runAdversarialLoop(
		questionWithScheme,
		grader,
		resolveModel(studentConfig[0]),
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

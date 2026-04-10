import { db } from "@/db"
import { createMarkerOrchestrator } from "@/lib/grading/grader-config"
import { createLlmRunner } from "@/lib/infra/llm-runtime"
import type { MarkerOrchestrator } from "@mcp-gcse/shared"
import { buildQuestionWithMarkScheme } from "@mcp-gcse/shared"

let _orchestrator: MarkerOrchestrator | null = null
async function getOrchestrator(): Promise<MarkerOrchestrator> {
	if (!_orchestrator) {
		_orchestrator = await createMarkerOrchestrator(createLlmRunner())
	}
	return _orchestrator
}

type AnswerWithRelations = Awaited<ReturnType<typeof loadAnswer>>
type MarkSchemeForAnswer = Awaited<ReturnType<typeof loadMarkScheme>>

async function loadAnswer(answer_id: string) {
	return db.answer.findUniqueOrThrow({
		where: { id: answer_id },
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
}

async function loadMarkScheme(answer: AnswerWithRelations) {
	return db.markScheme.findFirstOrThrow({
		where: {
			question_id: answer.question_id,
		},
	})
}

/**
 * Load answer, run marking pipeline, persist MarkingResult and update Answer.
 * Idempotent: if answer is already completed, returns without re-marking.
 */
export async function markAnswerById(answer_id: string): Promise<{
	marked: boolean
	total_score?: number
	max_possible_score?: number
}> {
	const answer = await loadAnswer(answer_id)

	if (answer.marking_status === "completed") {
		return {
			marked: false,
			total_score: answer.total_score ?? undefined,
			max_possible_score: answer.max_possible_score,
		}
	}

	const q = answer.question

	const markScheme = await loadMarkScheme(answer)
	const questionWithMarkScheme = buildQuestionWithMarkScheme({
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

	const orchestrator = await getOrchestrator()
	const grade = await orchestrator.mark(
		questionWithMarkScheme,
		answer.student_answer,
	)

	const mark_points_results = grade.markPointsResults.map((mp) => ({
		point_number: mp.pointNumber,
		awarded: mp.awarded,
		reasoning: mp.reasoning,
		expected_criteria: mp.expectedCriteria,
		student_covered: mp.studentCovered,
	}))

	await db.markingResult.create({
		data: {
			answer_id,
			mark_scheme_id: markScheme.id,
			mark_points_results,
			total_score: grade.totalScore,
			max_possible_score: answer.max_possible_score,
			marked_at: new Date(),
			llm_reasoning: grade.llmReasoning,
			feedback_summary: grade.feedbackSummary,
			level_awarded: grade.levelAwarded ?? null,
			why_not_next_level: grade.whyNotNextLevel ?? null,
			cap_applied: grade.capApplied ?? null,
		},
	})

	await db.answer.update({
		where: { id: answer_id },
		data: {
			marking_status: "completed",
			total_score: grade.totalScore,
			marked_at: new Date(),
		},
	})

	return {
		marked: true,
		total_score: grade.totalScore,
		max_possible_score: answer.max_possible_score,
	}
}

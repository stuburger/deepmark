import { createOpenAI } from "@ai-sdk/openai"
import { Resource } from "sst"
import { db } from "@/db"
import {
	DeterministicMarker,
	Grader,
	LevelOfResponseMarker,
	LlmMarker,
	MarkerOrchestrator,
	parseMarkPointsFromPrisma,
	parseMarkingRulesFromPrisma,
	type QuestionWithMarkScheme,
} from "@mcp-gcse/shared"

const openai = createOpenAI({
	apiKey: Resource.OpenAiApiKey.value,
})

const grader = new Grader(openai("gpt-4o"), {
	systemPrompt:
		"You are an expert GCSE examiner. Mark the student's answer against the provided mark scheme. Return valid JSON matching the schema. Ignore spelling and grammar; focus on understanding and correct science. Be consistent and conservative: only award marks when there is clear evidence.",
})

const orchestrator = new MarkerOrchestrator([
	new DeterministicMarker(),
	new LevelOfResponseMarker(grader),
	new LlmMarker(grader),
])

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
}

async function loadMarkScheme(answer: AnswerWithRelations) {
	return db.markScheme.findFirstOrThrow({
		where: {
			question_id: answer.question_id,
			question_part_id: answer.question_part_id,
		},
	})
}

function buildQuestionWithMarkScheme(
	answer: AnswerWithRelations,
	markScheme: MarkSchemeForAnswer,
	questionText: string,
): QuestionWithMarkScheme {
	const q = answer.question
	const part = answer.question_part
	const questionType = part ? part.question_type : q.question_type
	const rawOptions = (part?.multiple_choice_options ?? q.multiple_choice_options) as
		| Array<{ option_label: string; option_text: string }>
		| null
		| undefined
	const availableOptions = Array.isArray(rawOptions)
		? rawOptions.map((o) => ({ optionLabel: o.option_label, optionText: o.option_text }))
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
		markingMethod: markScheme.marking_method ?? undefined,
		markingRules: parseMarkingRulesFromPrisma(markScheme.marking_rules),
	}
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

	const questionText = answer.question_part
		? answer.question.text + answer.question_part.text
		: answer.question.text

	const markScheme = await loadMarkScheme(answer)
	const questionWithMarkScheme = buildQuestionWithMarkScheme(
		answer,
		markScheme,
		questionText,
	)

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

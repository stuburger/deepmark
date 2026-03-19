import { db } from "@/db"
import { defaultChatModel } from "@/lib/google-generative-ai"
import { tool } from "@/tools/shared/tool-utils"
import type { MarkScheme } from "@mcp-gcse/db"
import { EvaluateAnswerSchema } from "./schema"

/** Mark scheme row from DB (mark_points is JsonValue at runtime but typed as unknown for assignment). */
type MarkSchemeRow = Omit<MarkScheme, "mark_points"> & { mark_points: unknown }

/** Shape of one entry in marking_results.mark_points_results */
type MarkPointResultItem = {
	point_number: number
	awarded: boolean
	reasoning: string
	expected_criteria: string
	student_covered: string
}
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

const grader = new Grader(defaultChatModel(), {
	systemPrompt:
		"You are an expert GCSE examiner. Mark the student's answer against the provided mark scheme. Return valid JSON matching the schema. Ignore spelling and grammar; focus on understanding and correct science. Be consistent and conservative: only award marks when there is clear evidence.",
})

const orchestrator = new MarkerOrchestrator([
	new DeterministicMarker(),
	new LevelOfResponseMarker(grader),
	new LlmMarker(grader),
])

function parseMultipleChoiceOptions(
	json: unknown,
): Array<{ optionLabel: string; optionText: string }> | undefined {
	if (!Array.isArray(json)) return undefined
	const opts = json
		.filter(
			(item): item is Record<string, unknown> =>
				item !== null &&
				typeof item === "object" &&
				"option_label" in item &&
				"option_text" in item,
		)
		.map((item) => ({
			optionLabel: String(item.option_label),
			optionText: String(item.option_text),
		}))
	return opts.length > 0 ? opts : undefined
}

function buildQuestionWithMarkScheme(
	question: {
		id: string
		text: string
		topic: string
		question_type: string
		multiple_choice_options: unknown
	},
	questionPart: {
		id: string
		part_label: string
		text: string
		question_type: string
		multiple_choice_options: unknown
	} | null,
	markScheme: {
		description: string
		guidance: string | null
		points_total: number
		correct_option_labels: string[]
		mark_points: unknown
		marking_method?: string
		marking_rules?: unknown
	},
	questionText: string,
): QuestionWithMarkScheme {
	const q = question
	const part = questionPart
	const questionType = (part ? part.question_type : q.question_type) as
		| "written"
		| "multiple_choice"
	const availableOptions = parseMultipleChoiceOptions(
		part?.multiple_choice_options ?? q.multiple_choice_options,
	)

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
			markScheme.marking_method === "deterministic" ||
			markScheme.marking_method === "point_based" ||
			markScheme.marking_method === "level_of_response"
				? markScheme.marking_method
				: undefined,
		markingRules: parseMarkingRulesFromPrisma(markScheme.marking_rules),
	}
}

export const handler = tool(EvaluateAnswerSchema, async (args, extra) => {
	const {
		question_id,
		question_part_id,
		student_answer,
		mark_scheme_id,
		expected_score,
	} = args

	console.log("[evaluate-answer] Handler invoked", {
		question_id,
		question_part_id,
		mark_scheme_id,
		answerLength: student_answer.length,
	})

	// Fetch the question
	const question = await db.question.findUniqueOrThrow({
		where: { id: question_id },
		select: {
			id: true,
			text: true,
			topic: true,
			subject: true,
			points: true,
			question_type: true,
			multiple_choice_options: true,
		},
	})

	// Fetch the question part if specified
	let questionPart: {
		id: string
		part_label: string
		text: string
		points: number | null
		question_type: string
		multiple_choice_options: unknown
	} | null = null
	if (question_part_id) {
		questionPart = await db.questionPart.findUniqueOrThrow({
			where: { id: question_part_id },
			select: {
				id: true,
				part_label: true,
				text: true,
				points: true,
				question_type: true,
				multiple_choice_options: true,
			},
		})
	}

	// Find the appropriate mark scheme
	let markScheme: MarkSchemeRow
	if (mark_scheme_id) {
		// Use the specified mark scheme
		markScheme = await db.markScheme.findUniqueOrThrow({
			where: { id: mark_scheme_id },
		})

		// Validate that the mark scheme matches the question/question part
		if (markScheme.question_id !== question_id) {
			throw new Error(
				`Mark scheme ${mark_scheme_id} does not belong to question ${question_id}`,
			)
		}

		if (markScheme.question_part_id !== question_part_id) {
			throw new Error(
				`Mark scheme ${mark_scheme_id} does not match question part ${question_part_id}`,
			)
		}
	} else {
		// Find the mark scheme automatically
		markScheme = await db.markScheme.findFirstOrThrow({
			where: {
				question_id: question_id,
				question_part_id: question_part_id,
			},
		})
	}

	const markPointsArray = parseMarkPointsFromPrisma(markScheme.mark_points)
	console.log("[evaluate-answer] Found mark scheme", {
		markSchemeId: markScheme.id,
		pointsTotal: markScheme.points_total,
		markPointsCount: markPointsArray.length,
	})

	// Calculate max possible score
	const maxPossibleScore =
		questionPart?.points || question.points || markScheme.points_total

	// Build question for shared orchestrator (DeterministicMarker for MCQ, LlmMarker for written)
	const questionText = questionPart
		? question.text + questionPart.text
		: question.text
	const questionWithMarkScheme = buildQuestionWithMarkScheme(
		{
			id: question.id,
			text: question.text,
			topic: question.topic,
			question_type: question.question_type,
			multiple_choice_options: question.multiple_choice_options,
		},
		questionPart,
		{
			description: markScheme.description,
			guidance: markScheme.guidance,
			points_total: markScheme.points_total,
			correct_option_labels: markScheme.correct_option_labels,
			mark_points: markScheme.mark_points,
			marking_method: markScheme.marking_method,
			marking_rules: markScheme.marking_rules,
		},
		questionText,
	)

	const grade = await orchestrator.mark(questionWithMarkScheme, student_answer)

	const markingResult: {
		mark_points_results: MarkPointResultItem[]
		total_score: number
		llm_reasoning: string
		feedback_summary: string
		level_awarded?: number
		why_not_next_level?: string
		cap_applied?: string
	} = {
		mark_points_results: grade.markPointsResults.map((mp) => ({
			point_number: mp.pointNumber,
			awarded: mp.awarded,
			reasoning: mp.reasoning,
			expected_criteria: mp.expectedCriteria,
			student_covered: mp.studentCovered,
		})),
		total_score: grade.totalScore,
		llm_reasoning: grade.llmReasoning,
		feedback_summary: grade.feedbackSummary,
		level_awarded: grade.levelAwarded,
		why_not_next_level: grade.whyNotNextLevel,
		cap_applied: grade.capApplied,
	}

	console.log("[evaluate-answer] Marking completed", {
		totalScore: markingResult.total_score,
		maxScore: maxPossibleScore,
		markPointsAwarded: markingResult.mark_points_results.filter(
			(mp) => mp.awarded,
		).length,
		expectedScore: expected_score,
	})

	// Calculate mark scheme testing metrics if expected_score is provided
	const testingAnalysis =
		expected_score !== undefined
			? {
					scoreDifference: markingResult.total_score - expected_score,
					accuracyPercentage:
						expected_score === 0
							? markingResult.total_score === 0
								? 100
								: 0
							: Math.max(
									0,
									100 -
										Math.abs(
											(markingResult.total_score - expected_score) /
												expected_score,
										) *
											100,
								),
					isAccurate: markingResult.total_score === expected_score,
					scoreError: Math.abs(markingResult.total_score - expected_score),
				}
			: null

	return `
🎯 **Answer Evaluation Results**

📄 **Question**: ${question.text.slice(0, 100)}${question.text.length > 100 ? "..." : ""}
${questionPart ? `📋 **Part ${questionPart.part_label}**: ${questionPart.text.slice(0, 100)}${questionPart.text.length > 100 ? "..." : ""}` : ""}

📊 **Score**: ${markingResult.total_score}/${maxPossibleScore} marks
${
	markingResult.level_awarded != null
		? `

📐 **Level of Response**: Level ${markingResult.level_awarded} awarded${markingResult.why_not_next_level ? `\n- Why not next level: ${markingResult.why_not_next_level}` : ""}${markingResult.cap_applied ? `\n- Cap applied: ${markingResult.cap_applied}` : ""}`
		: ""
}

${
	testingAnalysis
		? `
🧪 **Mark Scheme Testing Analysis**:
- Expected Score: ${expected_score}/${maxPossibleScore} marks
- Actual Score: ${markingResult.total_score}/${maxPossibleScore} marks
- Score Difference: ${testingAnalysis.scoreDifference > 0 ? "+" : ""}${testingAnalysis.scoreDifference} marks
- Accuracy: ${testingAnalysis.accuracyPercentage.toFixed(1)}%
- Status: ${testingAnalysis.isAccurate ? "✅ ACCURATE" : `❌ INACCURATE (Error: ${testingAnalysis.scoreError} marks)`}

${
	testingAnalysis.isAccurate
		? "🎉 **Perfect Match**: The mark scheme performed exactly as expected!"
		: `
⚠️ **Mark Scheme Issues Detected**:
${testingAnalysis.scoreDifference > 0 ? "• Mark scheme may be too lenient (over-marking)" : "• Mark scheme may be too strict (under-marking)"}
• Consider reviewing mark point criteria and guidance
• This discrepancy suggests the mark scheme needs refinement`
}
`
		: ""
}

💭 **Overall Reasoning**:
${markingResult.llm_reasoning}

📝 **Feedback Summary**:
${markingResult.feedback_summary}

🔍 **Detailed Mark Point Analysis**:
${markingResult.mark_points_results
	.map(
		(mp, index) =>
			`\n**Point ${mp.point_number}**: ${mp.awarded ? "✅ AWARDED" : "❌ NOT AWARDED"}
	Expected: ${mp.expected_criteria}
	Student covered: ${mp.student_covered}
	Reasoning: ${mp.reasoning}`,
	)
	.join("\n")}

📈 **Mark Scheme Performance**:
- Mark Scheme ID: ${markScheme.id}
- Points Awarded: ${markingResult.mark_points_results.filter((mp) => mp.awarded).length}/${markPointsArray.length}
- Score Percentage: ${Math.round((markingResult.total_score / maxPossibleScore) * 100)}%

${
	testingAnalysis
		? `
📊 **Testing Recommendations**:
${
	testingAnalysis.isAccurate
		? "• Mark scheme is performing well for this test case"
		: `• Review and refine mark scheme criteria
• Test with additional similar answers
• Consider adjusting mark point descriptions or guidance`
}
`
		: ""
}

⚠️ *Note: This evaluation was performed without saving the answer to the database. Use this for mark scheme testing and refinement.*
`
})

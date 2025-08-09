import { EvaluateAnswerSchema } from "./schema"
import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import z from "zod"
import { Resource } from "sst"
import { tool } from "@/tools/shared/tool-utils"
import { db } from "@/db"
import type {
	MarkPointResult,
	MarkScheme,
	Question,
	QuestionPart,
} from "@/generated/prisma"

type QuestionPartForMarking = {
	id: string
	part_label: string
	text: string
	points: number | null
	question_type: string
	multiple_choice_options: Array<{
		option_label: string
		option_text: string
	}>
}

const openai = createOpenAI({
	apiKey: Resource.OpenAiApiKey.value,
})

// Define the schema for the marking result (same as in mark-results/create/tool.ts)
const markingResultSchema = z.object({
	mark_points_results: z.array(
		z.object({
			point_number: z.number(),
			awarded: z.boolean(),
			reasoning: z
				.string()
				.describe(
					"Detailed reasoning for why this mark was or was not awarded",
				),
			expected_criteria: z
				.string()
				.describe("What the mark scheme expected for this point"),
			student_covered: z
				.string()
				.describe("What the student actually covered in their answer"),
		}),
	),
	total_score: z.number(),
	llm_reasoning: z
		.string()
		.describe("Chain-of-thought reasoning for the overall marking process"),
	feedback_summary: z
		.string()
		.describe("Overall feedback summary for the student"),
})

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
	let questionPart: QuestionPartForMarking | null = null
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
	let markScheme: MarkScheme
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

	console.log("[evaluate-answer] Found mark scheme", {
		markSchemeId: markScheme.id,
		pointsTotal: markScheme.points_total,
		markPointsCount: markScheme.mark_points.length,
	})

	// Calculate max possible score
	const maxPossibleScore =
		questionPart?.points || question.points || markScheme.points_total

	// Determine if this is a multiple choice question
	const isMultipleChoice = questionPart
		? questionPart.question_type === "multiple_choice"
		: question.question_type === "multiple_choice"

	// Create a temporary answer object for evaluation (not saved to DB)
	const tempAnswer = {
		id: "temp-answer",
		question_id: question_id,
		question_part_id: question_part_id,
		student_answer: student_answer,
		max_possible_score: maxPossibleScore,
	}

	let markingResult: {
		mark_points_results: MarkPointResult[]
		total_score: number
		llm_reasoning: string
		feedback_summary: string
	}
	if (isMultipleChoice) {
		// Handle multiple choice questions without LLM
		markingResult = evaluateMultipleChoiceAnswer(
			question,
			questionPart,
			markScheme,
			tempAnswer,
		)
	} else {
		// Call the LLM for marking written questions
		markingResult = await callLLMForMarking(
			{ text: question.text, topic: question.topic },
			questionPart,
			markScheme,
			tempAnswer,
		)
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
- Points Awarded: ${markingResult.mark_points_results.filter((mp) => mp.awarded).length}/${markScheme.mark_points.length}
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

function evaluateMultipleChoiceAnswer(
	question: Pick<
		Question,
		"text" | "topic" | "question_type" | "multiple_choice_options"
	>,
	questionPart: QuestionPartForMarking | null,
	markScheme: MarkScheme,
	answer: { student_answer: string },
): {
	mark_points_results: MarkPointResult[]
	total_score: number
	llm_reasoning: string
	feedback_summary: string
} {
	// Parse student answer - expect format like "A,C" or "A, C" or "A C"
	const studentSelectedOptions = answer.student_answer
		.toUpperCase()
		.replace(/[^A-Z]/g, "")
		.split("")
		.filter(Boolean)
		.sort()

	// Get correct options from mark scheme
	const correctOptions = markScheme.correct_option_labels
		.map((label) => label.toUpperCase())
		.sort()

	// Get available options from the question/question part
	const availableOptions = questionPart
		? questionPart.multiple_choice_options
		: question.multiple_choice_options

	// Check if student's answer matches correct options exactly
	const isCorrect =
		studentSelectedOptions.length === correctOptions.length &&
		studentSelectedOptions.every((option) => correctOptions.includes(option))

	// Create mark point results
	const mark_points_results: MarkPointResult[] = [
		{
			point_number: 1,
			awarded: isCorrect,
			reasoning: isCorrect
				? `Student selected options [${studentSelectedOptions.join(", ")}] which exactly matches the correct answer [${correctOptions.join(", ")}].`
				: `Student selected options [${studentSelectedOptions.join(", ")}] but the correct answer is [${correctOptions.join(", ")}]. ${
						studentSelectedOptions.length === 0
							? "No options were selected."
							: studentSelectedOptions.length !== correctOptions.length
								? `Wrong number of options selected (${studentSelectedOptions.length} vs ${correctOptions.length} required).`
								: "Selected options do not match the correct combination."
					}`,
			expected_criteria: `Must select exactly: ${correctOptions.join(", ")}`,
			student_covered:
				studentSelectedOptions.length > 0
					? `Selected: ${studentSelectedOptions.join(", ")}`
					: "No options selected",
		},
	]

	const total_score = isCorrect ? markScheme.points_total : 0

	// Create option breakdown for feedback
	const optionBreakdown = availableOptions
		.map((option: { option_label: string; option_text: string }) => {
			const isSelected = studentSelectedOptions.includes(
				option.option_label.toUpperCase(),
			)
			const shouldBeSelected = correctOptions.includes(
				option.option_label.toUpperCase(),
			)

			let status = ""
			if (isSelected && shouldBeSelected) status = "✅ Correctly selected"
			else if (isSelected && !shouldBeSelected)
				status = "❌ Incorrectly selected"
			else if (!isSelected && shouldBeSelected)
				status = "❌ Should have been selected"
			else status = "✅ Correctly not selected"

			return `${option.option_label}: ${option.option_text} - ${status}`
		})
		.join("\n")

	return {
		mark_points_results,
		total_score,
		llm_reasoning: `Multiple choice question evaluation: Student selected [${studentSelectedOptions.join(", ")}], correct answer is [${correctOptions.join(", ")}]. ${isCorrect ? "Perfect match - full marks awarded." : "No match - zero marks awarded."}`,
		feedback_summary: isCorrect
			? `Excellent! You correctly identified all the right options and avoided incorrect ones. Score: ${total_score}/${markScheme.points_total}`
			: `Incorrect answer. The correct options are: ${correctOptions.join(", ")}. Remember to select ALL correct options for multiple choice questions. Score: ${total_score}/${markScheme.points_total}\n\nOption breakdown:\n${optionBreakdown}`,
	}
}

async function callLLMForMarking(
	question: Pick<Question, "text" | "topic">,
	questionPart: QuestionPartForMarking | null,
	markScheme: MarkScheme,
	answer: { student_answer: string },
): Promise<{
	mark_points_results: MarkPointResult[]
	total_score: number
	llm_reasoning: string
	feedback_summary: string
}> {
	// Determine the text to use for marking
	const questionText = questionPart ? questionPart.text : question.text
	const partLabel = questionPart ? questionPart.part_label : null

	// Create the prompt for the LLM (same as in mark-results/create/tool.ts)
	const prompt = `You are an expert GCSE examiner. Mark the following student answer against the provided mark scheme.

<Topic>
${question.topic}
</Topic>

<FullQuestion>
${question.text}
</FullQuestion>

${
	questionPart
		? `<QuestionPart>
Part ${questionPart.part_label}: ${questionPart.text}
</QuestionPart>`
		: ""
}

<QuestionToMark>
${questionText}${partLabel ? ` (Part ${partLabel})` : ""}
</QuestionToMark>

<MarkScheme>
Description: ${markScheme.description}

Additional marking guidance for this question: 
${markScheme.guidance ?? "N/A"}

Total Marks: ${markScheme.points_total}

Mark Points:
${markScheme.mark_points
	.map(
		(point) =>
			`${point.point_number}. ${point.description} (${point.points} mark${
				point.points > 1 ? "s" : ""
			})

   ${point.criteria}`,
	)
	.join("\n\n")}
</MarkScheme>

<StudentAnswer>
${answer.student_answer}
</StudentAnswer>

<MarkingRules>
CRITICAL RULES:
- Total marks awarded MUST NOT exceed ${markScheme.points_total}
- Each mark point can only award 0 or 1 mark (no partial marks)
- If unsure between 0 or 1 mark, award 0 (conservative marking)
- Marks must sum exactly to your awarded total

PENALTY SYSTEM:
- If you can't find clear evidence in text: award 0 marks
- When in doubt, under-mark rather than over-mark
</MarkingRules>

<LLMInstructions>
Please analyze the student's answer systematically using chain-of-thought reasoning. For each mark point:

1. Think through the criteria step-by-step
2. Quote the specific part of the student's answer that relates to this mark point
3. Analyze whether the student's response meets the expected criteria
4. Provide detailed reasoning for your decision
5. Award 0 or 1 mark based on clear evidence

Your chain-of-thought reasoning should be systematic and thorough. 
Think through each mark point carefully before making your decision.

Provide your response in the exact JSON format shown below.
</LLMInstructions>

<ExampleOutputFormat>
{
  "mark_points_results": [
    {
      "point_number": 1,
      "awarded": true,
      "reasoning": "Student clearly describes the fermentation setup: 'Mix the yeast with sugar water'. This meets the criteria for describing the method/procedure.",
      "expected_criteria": "Mentions adding the sample to glucose/sugar solution OR mentions mixing yeast sample with sugar water OR describes setting up fermentation test",
      "student_covered": "Mix the yeast with sugar water"
    },
    {
      "point_number": 2,
      "awarded": false,
      "reasoning": "Student does not mention temperature conditions. No reference to warm conditions or specific temperature requirements.",
      "expected_criteria": "States warm temperature needed (e.g., 37°C, warm water bath, room temperature)",
      "student_covered": "No temperature conditions mentioned"
    }
  ],
  "total_score": 1,
  "llm_reasoning": "Systematic analysis: Point 1 - Student clearly describes fermentation setup with 'Mix the yeast with sugar water'. Point 2 - No temperature requirement mentioned. Total: 1/2 marks.",
  "feedback_summary": "Good start with the method but missing key conditions for the experiment to work properly."
}
</ExampleOutputFormat>
`

	try {
		console.log("[evaluate-answer] Calling generateObject with schema")

		// Ensure we have a valid API key
		if (!Resource.OpenAiApiKey.value) {
			throw new Error("OpenAI API key is not configured")
		}

		const result = await generateObject({
			model: openai("gpt-4o"),
			schema: markingResultSchema,
			prompt,
			temperature: 0.1, // Low temperature for consistent marking
		})

		console.log("[evaluate-answer] generateObject succeeded")
		const { object } = result

		// Validate that we got a valid object
		if (!object || typeof object !== "object") {
			throw new Error("generateObject returned invalid or empty result")
		}

		// Validate that total score matches the sum of awarded marks
		const calculatedTotal = object.mark_points_results.reduce(
			(sum, mp) => sum + +mp.awarded,
			0,
		)
		if (object.total_score !== calculatedTotal) {
			throw new Error(`Total score (${object.total_score}) does not match sum of awarded marks (${calculatedTotal}). 
		This indicates an inconsistency in the LLM output.`)
		}

		return object
	} catch (error) {
		console.error("[evaluate-answer] generateObject failed:", error)
		// Provide more detailed error information
		if (
			error instanceof Error &&
			error.message.includes("No object generated")
		) {
			throw new Error(
				`AI model failed to generate valid response. This may be due to: 1) Complex question content, 2) Model availability issues, or 3) Schema validation problems. Original error: ${error.message}`,
			)
		}
		throw new Error(
			`Failed to generate marking result: ${error instanceof Error ? error.message : "Unknown error"}`,
		)
	}
}

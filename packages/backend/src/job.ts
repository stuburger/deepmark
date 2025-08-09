import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import z from "zod"
import { Resource } from "sst"
import { db } from "@/db"
import type { MarkScheme, Question, QuestionPart } from "@/generated/prisma"

const openai = createOpenAI({
	apiKey: Resource.OpenAiApiKey.value,
})

interface TestResult {
	student_answer: string
	expected_score: number
	actual_score: number
	accuracy: number
	is_accurate: boolean
	score_difference: number
	answer_quality?: string
	notes?: string
	detailed_analysis: {
		mark_points_results: Array<{
			point_number: number
			awarded: boolean
			reasoning: string
			expected_criteria: string
			student_covered: string
		}>
		llm_reasoning: string
		feedback_summary: string
	}
}

interface TestSummary {
	total_tests: number
	accurate_tests: number
	overall_accuracy: number
	average_score_difference: number
	over_marking_count: number
	under_marking_count: number
	test_results: TestResult[]
}

// Schema for LLM-based mark scheme refinement
const markSchemeRefinementSchema = z.object({
	refined_mark_points: z.array(
		z.object({
			point_number: z.number(),
			description: z.string(),
			points: z.number().default(1),
			criteria: z.string(),
			refinement_reasoning: z
				.string()
				.describe("Why this mark point was changed"),
		}),
	),
	refined_description: z.string(),
	refined_guidance: z.string().optional(),
	refinement_summary: z.string().describe("Overall summary of changes made"),
	expected_improvements: z
		.string()
		.describe("What improvements these changes should bring"),
})

// Job payload schema
export const TestAndRefineJobSchema = z.object({
	mark_scheme_id: z.string(),
	test_answers: z.array(
		z.object({
			student_answer: z.string(),
			expected_score: z.number(),
			answer_quality: z.string().optional(),
			notes: z.string().optional(),
		}),
	),
	accuracy_threshold: z.number().min(0).max(100).default(80),
	max_refinement_cycles: z.number().min(0).max(10).default(3),
	auto_refine: z.boolean().default(true),
	preserve_total_marks: z.boolean().default(true),
})

export type TestAndRefineJobPayload = z.infer<typeof TestAndRefineJobSchema>

const jobHandler = async (event: {
	Records: Array<{
		body: string
	}>
}) => {
	console.log("[test-and-refine-job] Processing SQS messages", {
		recordCount: event.Records.length,
	})

	for (const record of event.Records) {
		try {
			const payload = JSON.parse(record.body) as TestAndRefineJobPayload
			console.log("[test-and-refine-job] Processing job", {
				mark_scheme_id: payload.mark_scheme_id,
				test_count: payload.test_answers.length,
			})

			await processTestAndRefineJob(payload)
		} catch (error) {
			console.error("[test-and-refine-job] Error processing job", { error })
			throw error // This will cause the message to be retried or sent to DLQ
		}
	}
}

export const handler = jobHandler

async function processTestAndRefineJob(payload: TestAndRefineJobPayload) {
	const {
		mark_scheme_id,
		test_answers,
		accuracy_threshold,
		max_refinement_cycles,
		auto_refine,
		preserve_total_marks,
	} = payload

	console.log("[test-and-refine-job] Starting processing", {
		mark_scheme_id,
		test_count: test_answers.length,
		accuracy_threshold,
		max_refinement_cycles,
		auto_refine,
	})

	// Fetch the original mark scheme
	const originalMarkScheme = await db.markScheme.findUniqueOrThrow({
		where: { id: mark_scheme_id },
		include: {
			question: true,
			question_part: true,
		},
	})

	let currentMarkScheme = { ...originalMarkScheme }
	let refinementCycle = 0
	let finalTestSummary: TestSummary | undefined = undefined

	// Main testing and refinement loop
	while (refinementCycle <= max_refinement_cycles) {
		console.log(`[test-and-refine-job] Running test cycle ${refinementCycle}`)

		// Run tests with current mark scheme
		const testSummary = await runMarkSchemeTests(
			currentMarkScheme,
			originalMarkScheme.question,
			originalMarkScheme.question_part,
			test_answers,
		)

		finalTestSummary = testSummary

		console.log(
			`[test-and-refine-job] Test results: ${testSummary.overall_accuracy}% accuracy`,
		)

		// Check if accuracy meets threshold or we've reached max cycles
		if (
			testSummary.overall_accuracy >= accuracy_threshold ||
			refinementCycle >= max_refinement_cycles
		) {
			break
		}

		// If auto-refine is disabled, break after first test
		if (!auto_refine) {
			break
		}

		// Refine the mark scheme using LLM
		console.log(
			`[test-and-refine-job] Refining mark scheme (cycle ${refinementCycle + 1})`,
		)

		const refinedMarkScheme = await refineMarkSchemeWithLLM(
			currentMarkScheme,
			originalMarkScheme.question,
			originalMarkScheme.question_part,
			testSummary,
			preserve_total_marks,
		)

		currentMarkScheme = {
			...currentMarkScheme,
			...refinedMarkScheme,
		}

		refinementCycle++
	}

	// Generate final report - we know finalTestSummary is defined at this point
	if (!finalTestSummary) {
		throw new Error("No test summary available")
	}

	const finalReport = generateFinalReport(
		originalMarkScheme,
		currentMarkScheme,
		finalTestSummary,
		refinementCycle,
		accuracy_threshold,
		auto_refine,
	)

	// If the mark scheme was refined and meets threshold, offer to save it
	const shouldSave =
		auto_refine &&
		refinementCycle > 0 &&
		finalTestSummary.overall_accuracy >= accuracy_threshold

	if (shouldSave) {
		// Update the mark scheme in the database
		await db.markScheme.update({
			where: { id: mark_scheme_id },
			data: {
				description: currentMarkScheme.description,
				guidance: currentMarkScheme.guidance,
				mark_points: currentMarkScheme.mark_points,
				updated_at: new Date(),
			},
		})

		console.log("[test-and-refine-job] Mark scheme updated successfully")
	}

	// TODO: Store the final report somewhere (database, S3, etc.) or send notification
	// For now, just log it
	console.log("[test-and-refine-job] Final report generated:", finalReport)

	console.log("[test-and-refine-job] Job completed successfully")
}

async function runMarkSchemeTests(
	markScheme: MarkScheme,
	question: Question,
	questionPart: QuestionPart | null,
	testAnswers: Array<{
		student_answer: string
		expected_score: number
		answer_quality?: string
		notes?: string
	}>,
): Promise<TestSummary> {
	const testResults: TestResult[] = []

	for (const testAnswer of testAnswers) {
		// Use the evaluate logic (similar to the evaluate tool)
		const markingResult = await callLLMForMarking(
			question,
			questionPart,
			markScheme,
			{ student_answer: testAnswer.student_answer },
		)

		const scoreDifference =
			markingResult.total_score - testAnswer.expected_score
		const accuracy =
			testAnswer.expected_score === 0
				? markingResult.total_score === 0
					? 100
					: 0
				: Math.max(
						0,
						100 - Math.abs(scoreDifference / testAnswer.expected_score) * 100,
					)

		testResults.push({
			student_answer: testAnswer.student_answer,
			expected_score: testAnswer.expected_score,
			actual_score: markingResult.total_score,
			accuracy,
			is_accurate: markingResult.total_score === testAnswer.expected_score,
			score_difference: scoreDifference,
			answer_quality: testAnswer.answer_quality,
			notes: testAnswer.notes,
			detailed_analysis: markingResult,
		})
	}

	const accurateTests = testResults.filter((r) => r.is_accurate).length
	const overMarkingCount = testResults.filter(
		(r) => r.score_difference > 0,
	).length
	const underMarkingCount = testResults.filter(
		(r) => r.score_difference < 0,
	).length
	const averageScoreDifference =
		testResults.reduce((sum, r) => sum + Math.abs(r.score_difference), 0) /
		testResults.length

	return {
		total_tests: testResults.length,
		accurate_tests: accurateTests,
		overall_accuracy: (accurateTests / testResults.length) * 100,
		average_score_difference: averageScoreDifference,
		over_marking_count: overMarkingCount,
		under_marking_count: underMarkingCount,
		test_results: testResults,
	}
}

async function refineMarkSchemeWithLLM(
	currentMarkScheme: MarkScheme,
	question: Question,
	questionPart: QuestionPart | null,
	testSummary: TestSummary,
	preserveTotalMarks: boolean,
): Promise<{
	description: string
	guidance?: string
	mark_points: Array<{
		point_number: number
		description: string
		points: number
		criteria: string
	}>
	refinement_summary: string
	expected_improvements: string
}> {
	// Analyze the failed test cases to understand patterns
	const failedTests = testSummary.test_results.filter((r) => !r.is_accurate)
	const overMarkingTests = failedTests.filter((r) => r.score_difference > 0)
	const underMarkingTests = failedTests.filter((r) => r.score_difference < 0)

	const prompt = `You are an expert GCSE examiner tasked with refining a mark scheme based on test results.

<CurrentMarkScheme>
Description: ${currentMarkScheme.description}
Guidance: ${currentMarkScheme.guidance || "None"}
Total Points: ${currentMarkScheme.points_total}

Mark Points:
${currentMarkScheme.mark_points
	.map(
		(mp) =>
			`${mp.point_number}. ${mp.description} (${mp.points} mark)
   Criteria: ${mp.criteria}`,
	)
	.join("\n\n")}
</CurrentMarkScheme>

<Question>
Topic: ${question.topic}
Subject: ${question.subject}
Text: ${question.text}
${questionPart ? `Part ${questionPart.part_label}: ${questionPart.text}` : ""}
</Question>

<TestResults>
Overall Accuracy: ${testSummary.overall_accuracy.toFixed(1)}%
Tests Passed: ${testSummary.accurate_tests}/${testSummary.total_tests}
Over-marking Cases: ${testSummary.over_marking_count}
Under-marking Cases: ${testSummary.under_marking_count}
Average Score Error: ${testSummary.average_score_difference.toFixed(1)} marks

Failed Test Cases:
${failedTests
	.map(
		(test, idx) => `
Test ${idx + 1}: Expected ${test.expected_score}, Got ${test.actual_score} (Diff: ${test.score_difference > 0 ? "+" : ""}${test.score_difference})
Answer: "${test.student_answer.slice(0, 200)}${test.student_answer.length > 200 ? "..." : ""}"
Quality: ${test.answer_quality || "N/A"}
Notes: ${test.notes || "N/A"}

LLM Reasoning: ${test.detailed_analysis.llm_reasoning}

Mark Points Analysis:
${test.detailed_analysis.mark_points_results
	.map(
		(mp) =>
			`  Point ${mp.point_number}: ${mp.awarded ? "AWARDED" : "NOT AWARDED"}
  Expected: ${mp.expected_criteria}
  Student: ${mp.student_covered}
  Reasoning: ${mp.reasoning}`,
	)
	.join("\n")}
`,
	)
	.join("\n")}
</TestResults>

<RefinementTask>
Based on the test results, refine the mark scheme to improve accuracy. Focus on:

1. OVER-MARKING ISSUES (${overMarkingTests.length} cases):
   - Tighten criteria that are too lenient
   - Add more specific requirements
   - Clarify what doesn't qualify for marks

2. UNDER-MARKING ISSUES (${underMarkingTests.length} cases):
   - Broaden criteria that are too restrictive  
   - Accept alternative valid approaches
   - Clarify acceptable variations

3. GENERAL IMPROVEMENTS:
   - Make criteria more precise and unambiguous
   - Add examples of what qualifies/doesn't qualify
   - Improve mark point descriptions

${preserveTotalMarks ? "CONSTRAINT: You MUST preserve the total marks (each mark point = 1 mark)." : "You may adjust point values if needed."}

Provide refined mark points with clear reasoning for each change.
</RefinementTask>`

	const { object } = await generateObject({
		model: openai("gpt-4o"),
		schema: markSchemeRefinementSchema,
		prompt,
		temperature: 0.3,
	})

	// Ensure total marks are preserved if required
	if (preserveTotalMarks) {
		const totalRefinedPoints = object.refined_mark_points.reduce(
			(sum, mp) => sum + mp.points,
			0,
		)
		if (totalRefinedPoints !== currentMarkScheme.points_total) {
			// Adjust points to match original total
			for (const mp of object.refined_mark_points) {
				mp.points = 1
			}
		}
	}

	return {
		description: object.refined_description,
		guidance: object.refined_guidance,
		mark_points: object.refined_mark_points,
		refinement_summary: object.refinement_summary,
		expected_improvements: object.expected_improvements,
	}
}

function generateFinalReport(
	originalMarkScheme: MarkScheme & {
		question: Question
		question_part: QuestionPart | null
	},
	finalMarkScheme: MarkScheme & {
		refinement_summary?: string
		expected_improvements?: string
	},
	testSummary: TestSummary,
	refinementCycles: number,
	accuracyThreshold: number,
	autoRefine: boolean,
): string {
	const wasRefined = refinementCycles > 0
	const meetsThreshold = testSummary.overall_accuracy >= accuracyThreshold

	return `
🧪 **Mark Scheme Testing & Refinement Report**

📋 **Mark Scheme**: ${originalMarkScheme.id}
📄 **Question**: ${originalMarkScheme.question.text.slice(0, 100)}${originalMarkScheme.question.text.length > 100 ? "..." : ""}
${originalMarkScheme.question_part ? `📍 **Part**: ${originalMarkScheme.question_part.part_label}` : ""}

📊 **Test Results Summary**:
- Total Test Cases: ${testSummary.total_tests}
- Passed Tests: ${testSummary.accurate_tests}/${testSummary.total_tests}
- Overall Accuracy: ${testSummary.overall_accuracy.toFixed(1)}%
- Target Threshold: ${accuracyThreshold}%
- Status: ${meetsThreshold ? "✅ MEETS THRESHOLD" : "❌ BELOW THRESHOLD"}

📈 **Detailed Metrics**:
- Average Score Error: ${testSummary.average_score_difference.toFixed(2)} marks
- Over-marking Cases: ${testSummary.over_marking_count}
- Under-marking Cases: ${testSummary.under_marking_count}

${
	wasRefined
		? `
🔧 **Refinement Results**:
- Refinement Cycles: ${refinementCycles}
- Final Status: ${meetsThreshold ? "Successfully refined" : "Needs further work"}
- Auto-refinement: ${autoRefine ? "Enabled" : "Disabled"}

📝 **Changes Made**:
${finalMarkScheme.refinement_summary || "Mark scheme was refined based on test results"}

🎯 **Expected Improvements**:
${finalMarkScheme.expected_improvements || "Better accuracy on similar test cases"}

${meetsThreshold && autoRefine ? "💾 **Mark scheme has been automatically updated in the database**" : ""}
`
		: `
⚠️ **No Refinement Performed**:
${!autoRefine ? "- Auto-refinement was disabled" : "- Initial accuracy met threshold"}
`
}

🔍 **Individual Test Results**:
${testSummary.test_results
	.map(
		(result, idx) => `
**Test ${idx + 1}**: ${result.is_accurate ? "✅" : "❌"} ${result.actual_score}/${result.expected_score} marks (${result.accuracy.toFixed(1)}% accurate)
${result.answer_quality ? `Quality: ${result.answer_quality}` : ""}
Answer: "${result.student_answer.slice(0, 100)}${result.student_answer.length > 100 ? "..." : ""}"
${!result.is_accurate ? `Issue: ${result.score_difference > 0 ? "Over-marked" : "Under-marked"} by ${Math.abs(result.score_difference)} marks` : ""}
${result.notes ? `Notes: ${result.notes}` : ""}
`,
	)
	.join("\n")}

📋 **Recommendations**:
${
	meetsThreshold
		? "• Mark scheme is performing well and ready for use"
		: `• Consider additional refinement or manual review
• Test with more diverse answer samples
• Review mark point criteria for clarity`
}

${
	!meetsThreshold && !autoRefine
		? "• Enable auto-refinement for automatic improvements"
		: ""
}

⚠️ *This report shows testing results${wasRefined && meetsThreshold ? " and the mark scheme has been updated" : " - no database changes were made"}.*
`
}

// Import the LLM marking function from the evaluate tool
async function callLLMForMarking(
	question: Question,
	questionPart: QuestionPart | null,
	markScheme: MarkScheme,
	answer: { student_answer: string },
): Promise<{
	mark_points_results: Array<{
		point_number: number
		awarded: boolean
		reasoning: string
		expected_criteria: string
		student_covered: string
	}>
	total_score: number
	llm_reasoning: string
	feedback_summary: string
}> {
	const questionText = questionPart ? questionPart.text : question.text
	const partLabel = questionPart ? questionPart.part_label : null

	const markingResultSchema = z.object({
		mark_points_results: z.array(
			z.object({
				point_number: z.number(),
				awarded: z.boolean(),
				reasoning: z.string(),
				expected_criteria: z.string(),
				student_covered: z.string(),
			}),
		),
		total_score: z.number(),
		llm_reasoning: z.string(),
		feedback_summary: z.string(),
	})

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

Provide your response in the specified JSON format.
</LLMInstructions>`

	const { object } = await generateObject({
		model: openai("gpt-4o"),
		schema: markingResultSchema,
		prompt,
		temperature: 0.1,
	})

	// Validate that total score matches the sum of awarded marks
	const calculatedTotal = object.mark_points_results.reduce(
		(sum, mp) => sum + +mp.awarded,
		0,
	)
	if (object.total_score !== calculatedTotal) {
		throw new Error(
			`Total score (${object.total_score}) does not match sum of awarded marks (${calculatedTotal})`,
		)
	}

	return object
}

import { CreateTestDatasetSchema } from "./schema"
import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import z from "zod"
import { Resource } from "sst"
import { tool } from "@/tools/shared/tool-utils"
import { db } from "@/db"

const openai = createOpenAI({
	apiKey: Resource.OpenAiApiKey.value,
})

interface TestCase {
	student_answer: string
	expected_score: number
	answer_quality: string
	notes?: string
	topic_focus?: string
}

// Schema for LLM-generated test cases
const additionalTestCasesSchema = z.object({
	test_cases: z.array(
		z.object({
			student_answer: z.string(),
			expected_score: z.number(),
			answer_quality: z.enum(["excellent", "good", "average", "poor", "fail"]),
			notes: z.string().describe("Why this answer gets this score"),
			topic_focus: z.string().describe("What aspect this answer focuses on"),
			reasoning: z
				.string()
				.describe("Detailed reasoning for the expected score"),
		}),
	),
	generation_summary: z
		.string()
		.describe("Summary of the generated test cases"),
})

export const handler = tool(CreateTestDatasetSchema, async (args, extra) => {
	const {
		question_id,
		question_part_id,
		dataset_name,
		answer_examples,
		generate_additional,
		additional_count,
	} = args

	console.log("[create-test-dataset] Handler invoked", {
		question_id,
		question_part_id,
		dataset_name,
		examples_count: answer_examples.length,
		generate_additional,
		additional_count,
	})

	// Fetch the question and question part details
	const question = await db.question.findUniqueOrThrow({
		where: { id: question_id },
		select: {
			id: true,
			text: true,
			topic: true,
			subject: true,
			points: true,
			question_type: true,
		},
	})

	let questionPart = null
	if (question_part_id) {
		questionPart = await db.questionPart.findUniqueOrThrow({
			where: { id: question_part_id },
			select: {
				id: true,
				part_label: true,
				text: true,
				points: true,
				question_type: true,
			},
		})
	}

	// Get the mark scheme to understand the scoring range
	const markScheme = await db.markScheme.findFirstOrThrow({
		where: {
			question_id: question_id,
			question_part_id: question_part_id,
		},
		select: {
			id: true,
			points_total: true,
			description: true,
			mark_points: true,
		},
	})

	// Validate that example scores are within the valid range
	const maxPossibleScore = markScheme.points_total
	const invalidExamples = answer_examples.filter(
		(example) => example.expected_score > maxPossibleScore,
	)

	if (invalidExamples.length > 0) {
		throw new Error(
			`Some example answers have scores higher than the maximum possible score (${maxPossibleScore}). Invalid scores: ${invalidExamples.map((e) => e.expected_score).join(", ")}`,
		)
	}

	let allTestCases: TestCase[] = [...answer_examples]

	// Generate additional test cases if requested
	let generationSummary = ""
	if (generate_additional && additional_count > 0) {
		console.log(
			`[create-test-dataset] Generating ${additional_count} additional test cases`,
		)

		const additionalCases = await generateAdditionalTestCases(
			question,
			questionPart,
			markScheme,
			answer_examples,
			additional_count,
		)

		allTestCases = [...allTestCases, ...additionalCases.test_cases]
		generationSummary = additionalCases.generation_summary
	}

	// Analyze the dataset
	const datasetAnalysis = analyzeTestDataset(allTestCases, maxPossibleScore)

	// Create the final report
	const report = generateDatasetReport(
		question,
		questionPart,
		markScheme,
		dataset_name,
		allTestCases,
		datasetAnalysis,
		generationSummary,
	)

	console.log("[create-test-dataset] Dataset created successfully", {
		total_cases: allTestCases.length,
		score_distribution: datasetAnalysis.score_distribution,
	})

	return report
})

async function generateAdditionalTestCases(
	question: {
		id: string
		text: string
		topic: string
		subject: string
		points: number | null
		question_type: string
	},
	questionPart: {
		id: string
		part_label: string
		text: string
		points: number | null
		question_type: string
	} | null,
	markScheme: {
		id: string
		points_total: number
		description: string
		mark_points: Array<{
			point_number: number
			description: string
			points: number
			criteria: string
		}>
	},
	examples: TestCase[],
	count: number,
): Promise<{
	test_cases: TestCase[]
	generation_summary: string
}> {
	const questionText = questionPart ? questionPart.text : question.text
	const partLabel = questionPart ? questionPart.part_label : null

	const prompt = `You are an expert GCSE examiner creating test cases for mark scheme validation.

<Question>
Topic: ${question.topic}
Subject: ${question.subject}
Text: ${question.text}
${questionPart ? `Part ${questionPart.part_label}: ${questionPart.text}` : ""}
</Question>

<MarkScheme>
Description: ${markScheme.description}
Total Marks: ${markScheme.points_total}

Mark Points:
${markScheme.mark_points
	.map(
		(mp) =>
			`${mp.point_number}. ${mp.description} (${mp.points} mark)
   Criteria: ${mp.criteria}`,
	)
	.join("\n\n")}
</MarkScheme>

<ExampleTestCases>
${examples
	.map(
		(example, idx) => `
Example ${idx + 1}:
Answer: "${example.student_answer}"
Expected Score: ${example.expected_score}/${markScheme.points_total}
Quality: ${example.answer_quality}
Notes: ${example.notes || "N/A"}
Topic Focus: ${example.topic_focus || "N/A"}
`,
	)
	.join("\n")}
</ExampleTestCases>

<Task>
Generate ${count} additional test cases that:

1. COVER DIFFERENT SCORE RANGES:
   - Include cases for all possible scores (0 to ${markScheme.points_total})
   - Ensure good distribution across quality levels

2. TEST EDGE CASES:
   - Partially correct answers
   - Common misconceptions
   - Alternative valid approaches
   - Borderline cases between score levels

3. VARY ANSWER STYLES:
   - Different levels of detail
   - Different scientific terminology usage
   - Various explanation approaches
   - Mix of complete and incomplete responses

4. MAINTAIN REALISM:
   - Use language appropriate for GCSE students
   - Include common student errors
   - Reflect typical answer patterns

For each test case, provide:
- A realistic student answer
- Expected score with detailed reasoning
- Quality category and notes
- Topic focus area

Ensure the generated cases complement the provided examples and create a comprehensive test dataset.
</Task>`

	const { object } = await generateObject({
		model: openai("gpt-4o"),
		schema: additionalTestCasesSchema,
		prompt,
		temperature: 0.7, // Higher temperature for diversity
	})

	return {
		test_cases: object.test_cases.map((tc) => ({
			student_answer: tc.student_answer,
			expected_score: tc.expected_score,
			answer_quality: tc.answer_quality,
			notes: tc.notes,
			topic_focus: tc.topic_focus,
		})),
		generation_summary: object.generation_summary,
	}
}

function analyzeTestDataset(
	testCases: TestCase[],
	maxScore: number,
): {
	total_cases: number
	score_distribution: number[]
	quality_distribution: Record<string, number>
	coverage_gaps: number[]
	score_range: { min: number; max: number }
	average_score: number
} {
	const scoreDistribution = Array(maxScore + 1).fill(0)
	const qualityDistribution: Record<string, number> = {
		excellent: 0,
		good: 0,
		average: 0,
		poor: 0,
		fail: 0,
	}

	for (const testCase of testCases) {
		scoreDistribution[testCase.expected_score]++
		qualityDistribution[testCase.answer_quality]++
	}

	const coverageGaps = scoreDistribution
		.map((count, score) => ({ score, count }))
		.filter((item) => item.count === 0)
		.map((item) => item.score)

	return {
		total_cases: testCases.length,
		score_distribution: scoreDistribution,
		quality_distribution: qualityDistribution,
		coverage_gaps: coverageGaps,
		score_range: {
			min: Math.min(...testCases.map((tc) => tc.expected_score)),
			max: Math.max(...testCases.map((tc) => tc.expected_score)),
		},
		average_score:
			testCases.reduce((sum, tc) => sum + tc.expected_score, 0) /
			testCases.length,
	}
}

function generateDatasetReport(
	question: {
		id: string
		text: string
		topic: string
		subject: string
	},
	questionPart: {
		part_label: string
		text: string
	} | null,
	markScheme: {
		id: string
		points_total: number
		mark_points: Array<{ point_number: number }>
	},
	datasetName: string,
	testCases: TestCase[],
	analysis: {
		total_cases: number
		score_distribution: number[]
		quality_distribution: Record<string, number>
		coverage_gaps: number[]
		score_range: { min: number; max: number }
		average_score: number
	},
	generationSummary: string,
): string {
	return `
📊 **Test Dataset Created: ${datasetName}**

📄 **Question Details**:
- Question ID: ${question.id}
- Topic: ${question.topic} (${question.subject})
- Text: ${question.text.slice(0, 150)}${question.text.length > 150 ? "..." : ""}
${questionPart ? `- Part ${questionPart.part_label}: ${questionPart.text.slice(0, 100)}${questionPart.text.length > 100 ? "..." : ""}` : ""}

🎯 **Mark Scheme Information**:
- Mark Scheme ID: ${markScheme.id}
- Total Marks: ${markScheme.points_total}
- Mark Points: ${markScheme.mark_points.length}

📈 **Dataset Analysis**:
- Total Test Cases: ${analysis.total_cases}
- Score Range: ${analysis.score_range.min} - ${analysis.score_range.max} marks
- Average Score: ${analysis.average_score.toFixed(1)} marks

📊 **Score Distribution**:
${analysis.score_distribution
	.map(
		(count: number, score: number) =>
			`${score} marks: ${count} cases${count === 0 ? " ❌" : " ✅"}`,
	)
	.join("\n")}

🏆 **Quality Distribution**:
${Object.entries(analysis.quality_distribution)
	.map(
		([quality, count]) =>
			`${quality.charAt(0).toUpperCase() + quality.slice(1)}: ${count} cases`,
	)
	.join("\n")}

${
	analysis.coverage_gaps.length > 0
		? `
⚠️ **Coverage Gaps**:
Missing test cases for scores: ${analysis.coverage_gaps.join(", ")}
Consider adding examples for these score levels.
`
		: "✅ **Complete Coverage**: All possible scores are represented"
}

${
	generationSummary
		? `
🤖 **AI Generation Summary**:
${generationSummary}
`
		: ""
}

📋 **Test Cases**:
${testCases
	.map(
		(tc, idx) => `
**Test Case ${idx + 1}**: ${tc.expected_score}/${markScheme.points_total} marks (${tc.answer_quality})
Answer: "${tc.student_answer.slice(0, 200)}${tc.student_answer.length > 200 ? "..." : ""}"
${tc.topic_focus ? `Focus: ${tc.topic_focus}` : ""}
${tc.notes ? `Notes: ${tc.notes}` : ""}
`,
	)
	.join("\n")}

🚀 **Next Steps**:
1. Use this dataset with the "test-and-refine-mark-scheme" tool
2. Set accuracy threshold (recommended: 80-90%)
3. Enable auto-refinement for automatic improvements
4. Add more test cases if coverage gaps exist

💡 **Usage Example**:
Call "test-and-refine-mark-scheme" with:
- mark_scheme_id: "${markScheme.id}"
- test_answers: [copy the test cases above]
- accuracy_threshold: 85
- auto_refine: true

🎯 **Dataset Quality**: ${analysis.coverage_gaps.length === 0 ? "Excellent" : analysis.coverage_gaps.length <= 2 ? "Good" : "Needs Improvement"}
`
}

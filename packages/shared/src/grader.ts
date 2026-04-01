import { type LanguageModel, Output, generateText } from "ai"
import { z } from "zod"

// ============================================
// TYPES
// ============================================

/**
 * A mark point for a question (represents one awardable point).
 * Matches Prisma mark_points JSON but in camelCase; isRequired defaults to false when parsed from DB.
 */
export interface GcseMarkPoint {
	pointNumber: number
	description: string
	points: number
	criteria: string
	isRequired: boolean
}

/**
 * Level-of-response level descriptor (stored in marking_rules.levels).
 */
export interface MarkingRulesLevel {
	level: number
	mark_range: [number, number]
	descriptor: string
	// DB stores explicit null when no AO requirements; treat null same as absent
	ao_requirements?: string[] | null
}

/**
 * Level-of-response cap (stored in marking_rules.caps).
 */
export interface MarkingRulesCap {
	condition: string
	max_level?: number
	max_mark?: number
	reason: string
}

/**
 * Marking rules for level_of_response (stored in MarkScheme.marking_rules Json).
 */
export interface MarkingRules {
	command_word?: string
	items_required?: number | null
	levels: MarkingRulesLevel[]
	caps?: MarkingRulesCap[]
}

/**
 * A question with its mark scheme, adapted for GCSE (written | multiple_choice).
 */
export interface QuestionWithMarkScheme {
	id: string
	questionType: "written" | "multiple_choice"
	questionText: string
	topic: string
	rubric: string
	guidance?: string | null
	totalPoints: number
	markPoints: GcseMarkPoint[]
	/** For MCQ: correct option labels e.g. ["A", "C"] */
	correctOptionLabels?: string[]
	/** For MCQ: available options for feedback */
	availableOptions?: Array<{ optionLabel: string; optionText: string }>
	/** How to mark: deterministic (MCQ), point_based, or level_of_response */
	markingMethod?: "deterministic" | "point_based" | "level_of_response"
	/** For level_of_response: levels, caps, command_word, items_required */
	markingRules?: MarkingRules | null
}

/**
 * Response parsed from student submission
 */
export interface ParsedResponse {
	questionId: string
	answer: string
}

/**
 * Learning content for providing context and feedback (optional)
 */
export interface LearningContentItem {
	id: string
	title: string
	slug: string
	content: string
	order: number
}

// ============================================
// PRISMA HELPERS — moved to grader-prisma.ts
// ============================================

export {
	parseMarkPointsFromPrisma,
	parseMarkingRulesFromPrisma,
} from "./grader-prisma"

// ============================================
// SCHEMAS (LLM output)
// ============================================

const MarkPointResultSchema = z.object({
	pointNumber: z.number(),
	awarded: z.boolean(),
	reasoning: z
		.string()
		.describe("Detailed reasoning for why this mark was or was not awarded"),
	expectedCriteria: z
		.string()
		.describe("What the mark scheme expected for this point"),
	studentCovered: z
		.string()
		.describe("What the student actually covered in their answer"),
})

const QuestionGradeSchema = z.object({
	questionId: z.string().describe("The ID of the question being graded"),
	markPointsResults: z.array(MarkPointResultSchema),
	totalScore: z.number(),
	llmReasoning: z
		.string()
		.describe("Chain-of-thought reasoning for the overall marking process"),
	feedbackSummary: z
		.string()
		.describe("Overall feedback summary for the student"),
	correctAnswer: z
		.string()
		.describe(
			"The correct/model answer for this question - what the student should have answered",
		),
	relevantLearningSnippet: z
		.string()
		.describe(
			"A relevant snippet from the learning material that explains or supports the correct answer. Empty if not applicable.",
		),
})

/** Schema for Level-of-Response grading output (levelAwarded, whyNotNextLevel, capApplied required). */
export const LoRQuestionGradeSchema = z.object({
	questionId: z.string().describe("The ID of the question being graded"),
	markPointsResults: z.array(MarkPointResultSchema),
	totalScore: z.number(),
	llmReasoning: z
		.string()
		.describe("Chain-of-thought reasoning for the overall marking process"),
	feedbackSummary: z
		.string()
		.describe("Overall feedback summary for the student"),
	correctAnswer: z
		.string()
		.describe(
			"The correct/model answer for this question - what the student should have answered",
		),
	relevantLearningSnippet: z
		.string()
		.describe(
			"A relevant snippet from the learning material that explains or supports the correct answer. Empty if not applicable.",
		),
	levelAwarded: z
		.number()
		.int()
		.min(0)
		.describe("The level (1-based) awarded for this response"),
	whyNotNextLevel: z
		.string()
		.describe(
			"Brief explanation of why the next level was not reached (or empty if full marks)",
		),
	capApplied: z
		.string()
		.describe("If a cap limited the mark, describe it; otherwise empty string"),
})

const BatchGradeSchema = z.object({
	questionGrades: z.array(QuestionGradeSchema),
})

export type MarkPointResultGrade = z.infer<typeof MarkPointResultSchema>
export type QuestionGradeResult = z.infer<typeof QuestionGradeSchema>

export type QuestionGrade = QuestionGradeResult & {
	maxPossibleScore: number
	scorePercentage: number
	passed: boolean
	levelAwarded?: number
	whyNotNextLevel?: string
	capApplied?: string
}

export interface AssessmentGrade {
	grades: QuestionGrade[]
	totalPointsAwarded: number
	totalMaxPoints: number
	overallScore: number
}

// ============================================
// INPUT TYPES
// ============================================

export interface GradeResponsesInput {
	questions: QuestionWithMarkScheme[]
	responses: ParsedResponse[]
	learningContent?: LearningContentItem[]
}

export interface GradeSingleResponseInput {
	question: QuestionWithMarkScheme
	answer: string
	questionNumber?: number
	totalQuestions?: number
	learningContent?: LearningContentItem[]
}

// ============================================
// GRADER CLASS
// ============================================

export interface GraderOptions {
	systemPrompt?: string
}

const DEFAULT_SYSTEM_PROMPT =
	"You are an expert GCSE examiner. Mark the student's answer against the provided mark scheme. Return valid JSON matching the schema. Ignore spelling and grammar; focus on understanding and correct science. Be consistent and conservative: only award marks when there is clear evidence."

export class Grader {
	private model: LanguageModel
	private systemPrompt: string

	constructor(model: LanguageModel, options?: GraderOptions) {
		this.model = model
		this.systemPrompt = options?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
	}

	private buildBatchGradingPrompt(
		questions: QuestionWithMarkScheme[],
		responses: ParsedResponse[],
		learningContent: LearningContentItem[],
	): string {
		const learningSection =
			learningContent.length > 0
				? `<LearningMaterial>\n${learningContent
						.map((lc, i) => `## ${i + 1}. ${lc.title}\n\n${lc.content}`)
						.join("\n\n---\n\n")}\n</LearningMaterial>\n\n`
				: ""

		const questionsSection = questions
			.map((q, index) => {
				const response = responses.find((r) => r.questionId === q.id)
				const answer = response?.answer ?? "[No answer provided]"
				const markPointsList = q.markPoints
					.map(
						(mp) =>
							`   [pointNumber: ${mp.pointNumber}] ${mp.description} (${mp.points} mark${mp.points > 1 ? "s" : ""}${mp.isRequired ? ", REQUIRED" : ""})\n   Criteria: ${mp.criteria}`,
					)
					.join("\n\n")
				return `### Question ${index + 1} [ID: ${q.id}]
Type: ${q.questionType}
Total Points: ${q.totalPoints}

**Topic:** ${q.topic}

**Question:**\n${q.questionText}

**Mark Scheme:**\n${q.rubric}\n${q.guidance ? `\nGuidance: ${q.guidance}` : ""}

Mark Points:\n${markPointsList}

**Student's Answer:**\n${answer}`
			})
			.join("\n\n---\n\n")

		return `${learningSection}<Assessment>\n${questionsSection}\n</Assessment>

<MarkingRules>
- For each mark point, decide: was this mark point met? (true/false)
- Each mark point is binary: fully met or not met (no partial credit per point)
- Total marks awarded MUST NOT exceed the question's total points
- If unsure, be conservative (don't award)
- Ignore spelling/grammar; focus on correct concepts
</MarkingRules>

<Instructions>
For EACH question provide: questionId, markPointsResults (with pointNumber, awarded, reasoning, expectedCriteria, studentCovered), totalScore, llmReasoning, feedbackSummary, correctAnswer, relevantLearningSnippet.
</Instructions>`
	}

	private buildQuestionGradingPrompt(
		question: QuestionWithMarkScheme,
		answer: string,
		questionNumber?: number,
		totalQuestions?: number,
		learningContent?: LearningContentItem[],
	): string {
		const markPointsList = question.markPoints
			.map(
				(mp) =>
					`[pointNumber: ${mp.pointNumber}] ${mp.description} (${mp.points} mark${mp.points > 1 ? "s" : ""}${mp.isRequired ? ", REQUIRED" : ""})\n   Criteria: ${mp.criteria}`,
			)
			.join("\n\n")

		const learningSection =
			learningContent && learningContent.length > 0
				? `<LearningMaterial>\n${learningContent.map((lc) => `## ${lc.title}\n${lc.content}`).join("\n\n---\n\n")}\n</LearningMaterial>\n\n`
				: ""

		const parsingNote =
			questionNumber && totalQuestions && totalQuestions > 1
				? `\n<ParsingInstructions>This is question ${questionNumber} of ${totalQuestions}. Extract the answer for THIS question from the student's response before marking.</ParsingInstructions>\n`
				: ""

		return `Mark the answer against the provided mark scheme.

${learningSection}<Topic>\n${question.topic}\n</Topic>

<Question>\nQuestion ID: ${question.id}\nType: ${question.questionType}\n\n${question.questionText}\n</Question>

<MarkScheme>\nDescription: ${question.rubric}\n${question.guidance ? `Guidance: ${question.guidance}\n` : ""}\nTotal Points: ${question.totalPoints}\n\nMark Points:\n${markPointsList}\n</MarkScheme>

<StudentAnswer>\n${answer || "[No answer provided]"}\n</StudentAnswer>${parsingNote}

<MarkingRules>
- For each mark point, decide: met or not (true/false). Binary; no partial credit per point.
- Total marks awarded MUST NOT exceed ${question.totalPoints}
- If unsure, be conservative. Ignore spelling/grammar; focus on understanding.
</MarkingRules>

<Instructions>
Analyze the answer systematically. For each mark point provide reasoning, expectedCriteria, studentCovered, and awarded. Also provide correctAnswer and relevantLearningSnippet (or empty string). Output valid JSON matching the schema.
</Instructions>`
	}

	private buildLoRGradingPrompt(
		question: QuestionWithMarkScheme,
		answer: string,
		questionNumber?: number,
		totalQuestions?: number,
		learningContent?: LearningContentItem[],
	): string {
		const rules = question.markingRules
		if (!rules?.levels?.length) {
			throw new Error(
				`LevelOfResponse marking requires markingRules.levels for question ${question.id}`,
			)
		}

		const levelSections = rules.levels
			.map(
				(l) =>
					`Level ${l.level} (${l.mark_range[0]}-${l.mark_range[1]} marks): ${l.descriptor}${l.ao_requirements?.length ? `\n  AO requirements: ${l.ao_requirements.join("; ")}` : ""}`,
			)
			.join("\n\n")

		const capsSection =
			rules.caps && rules.caps.length > 0
				? `\n<Caps>\n${rules.caps
						.map(
							(c) =>
								`- ${c.condition}: max_level=${c.max_level ?? "—"}, max_mark=${c.max_mark ?? "—"}. ${c.reason}`,
						)
						.join("\n")}\n</Caps>`
				: ""

		const commandWordNote = rules.command_word
			? `\nCommand word: ${rules.command_word}.`
			: ""
		const itemsNote =
			rules.items_required != null
				? ` Number of items required: ${rules.items_required}.`
				: ""

		const learningSection =
			learningContent && learningContent.length > 0
				? `<LearningMaterial>\n${learningContent.map((lc) => `## ${lc.title}\n${lc.content}`).join("\n\n---\n\n")}\n</LearningMaterial>\n\n`
				: ""

		const parsingNote =
			questionNumber && totalQuestions && totalQuestions > 1
				? `\n<ParsingInstructions>This is question ${questionNumber} of ${totalQuestions}. Extract the answer for THIS question from the student's response before marking.</ParsingInstructions>\n`
				: ""

		return `Mark this answer using Level of Response (AQA-style). First decide which level the response reaches, then award a mark within that level's range. Quote short snippets from the student's text as evidence; do not infer application not present in the text.

${learningSection}<Topic>\n${question.topic}\n</Topic>

<Question>\nQuestion ID: ${question.id}\n\n${question.questionText}\n</Question>

<MarkScheme>\n${question.rubric}${question.guidance ? `\nGuidance: ${question.guidance}` : ""}\n\nTotal marks available: ${question.totalPoints}.${commandWordNote}${itemsNote}
</MarkScheme>

<LevelDescriptors>
${levelSections}
</LevelDescriptors>${capsSection}

<StudentAnswer>\n${answer || "[No answer provided]"}\n</StudentAnswer>${parsingNote}

<MarkingRules>
- Decide the highest level the response demonstrates (use level descriptors and evidence from the text).
- Award a mark within that level's range. If a cap applies, do not exceed the cap.
- Provide levelAwarded (the level number, 1-based), whyNotNextLevel (why the next level was not reached, or empty if full marks), and capApplied (if a cap limited the mark, describe it; otherwise empty string).
- Evidence: quote short snippets; do not infer application not present in the text.
</MarkingRules>

<Instructions>
Output valid JSON matching the schema. Include questionId, markPointsResults, totalScore, llmReasoning, feedbackSummary, correctAnswer, relevantLearningSnippet, levelAwarded, whyNotNextLevel, and capApplied.
</Instructions>`
	}

	async gradeResponses(input: GradeResponsesInput): Promise<AssessmentGrade> {
		const { questions, responses, learningContent = [] } = input
		const prompt = this.buildBatchGradingPrompt(
			questions,
			responses,
			learningContent,
		)

		const { output } = await generateText({
			model: this.model,
			messages: [
				{ role: "system", content: this.systemPrompt },
				{ role: "user", content: prompt },
			],
			output: Output.object({
				schema: BatchGradeSchema,
			}),
		})

		const batchResult = output
		const grades = batchResult.questionGrades.map((aiGrade) => {
			const question = questions.find((q) => q.id === aiGrade.questionId)
			if (!question) {
				throw new Error(`Question not found for ID: ${aiGrade.questionId}`)
			}
			const totalScore = aiGrade.markPointsResults
				.filter((mp) => mp.awarded)
				.reduce(
					(sum, mp) =>
						sum +
						(question.markPoints.find((p) => p.pointNumber === mp.pointNumber)
							?.points ?? 0),
					0,
				)
			const maxPossibleScore = question.totalPoints
			const scorePercentage =
				maxPossibleScore > 0
					? Math.round((totalScore / maxPossibleScore) * 100)
					: 0
			const requiredMarkPoints = question.markPoints.filter(
				(mp) => mp.isRequired,
			)
			const passed =
				requiredMarkPoints.length === 0 ||
				requiredMarkPoints.every((reqMp) => {
					const result = aiGrade.markPointsResults.find(
						(r) => r.pointNumber === reqMp.pointNumber,
					)
					return result?.awarded === true
				})

			return {
				...aiGrade,
				totalScore,
				maxPossibleScore,
				scorePercentage,
				passed,
			}
		})

		const totalPointsAwarded = grades.reduce((sum, g) => sum + g.totalScore, 0)
		const totalMaxPoints = grades.reduce(
			(sum, g) => sum + g.maxPossibleScore,
			0,
		)
		const overallScore =
			totalMaxPoints > 0
				? Math.round((totalPointsAwarded / totalMaxPoints) * 100)
				: 0

		return { grades, totalPointsAwarded, totalMaxPoints, overallScore }
	}

	async gradeSingleResponse(
		input: GradeSingleResponseInput,
	): Promise<QuestionGrade> {
		const {
			question,
			answer,
			questionNumber,
			totalQuestions,
			learningContent,
		} = input
		const prompt = this.buildQuestionGradingPrompt(
			question,
			answer,
			questionNumber,
			totalQuestions,
			learningContent,
		)

		const { output } = await generateText({
			model: this.model,
			messages: [
				{ role: "system", content: this.systemPrompt },
				{ role: "user", content: prompt },
			],
			output: Output.object({
				schema: QuestionGradeSchema,
			}),
		})

		const aiGrade = output
		const rawScore = aiGrade.markPointsResults
			.filter((mp) => mp.awarded)
			.reduce(
				(sum, mp) =>
					sum +
					(question.markPoints.find((p) => p.pointNumber === mp.pointNumber)
						?.points ?? 0),
				0,
			)
		const maxPossibleScore = question.totalPoints
		// Cap: tiered mark schemes (e.g. 1 mark partial / 2 marks full) can produce
		// raw sums exceeding points_total if the LLM awards multiple tiers.
		const totalScore = Math.min(rawScore, maxPossibleScore)
		const scorePercentage =
			maxPossibleScore > 0
				? Math.round((totalScore / maxPossibleScore) * 100)
				: 0
		const requiredMarkPoints = question.markPoints.filter((mp) => mp.isRequired)
		const passed =
			requiredMarkPoints.length === 0 ||
			requiredMarkPoints.every((reqMp) => {
				const result = aiGrade.markPointsResults.find(
					(r) => r.pointNumber === reqMp.pointNumber,
				)
				return result?.awarded === true
			})

		return {
			...aiGrade,
			questionId: question.id,
			totalScore,
			maxPossibleScore,
			scorePercentage,
			passed,
		}
	}

	/**
	 * Grade a single response using Level-of-Response marking. Uses markingRules.levels and caps.
	 * Returns QuestionGrade with levelAwarded, whyNotNextLevel, capApplied.
	 */
	async gradeSingleResponseLoR(
		input: GradeSingleResponseInput,
	): Promise<QuestionGrade> {
		const {
			question,
			answer,
			questionNumber,
			totalQuestions,
			learningContent,
		} = input
		const prompt = this.buildLoRGradingPrompt(
			question,
			answer,
			questionNumber,
			totalQuestions,
			learningContent,
		)

		const { output } = await generateText({
			model: this.model,
			messages: [
				{ role: "system", content: this.systemPrompt },
				{ role: "user", content: prompt },
			],
			output: Output.object({
				schema: LoRQuestionGradeSchema,
			}),
		})

		const aiGrade = output
		const maxPossibleScore = question.totalPoints
		const totalScore = Math.min(aiGrade.totalScore, maxPossibleScore)
		const scorePercentage =
			maxPossibleScore > 0
				? Math.round((totalScore / maxPossibleScore) * 100)
				: 0
		const passed = totalScore > 0

		return {
			...aiGrade,
			questionId: question.id,
			totalScore,
			maxPossibleScore,
			scorePercentage,
			passed,
			levelAwarded: aiGrade.levelAwarded,
			whyNotNextLevel: aiGrade.whyNotNextLevel,
			capApplied: aiGrade.capApplied,
		}
	}
}

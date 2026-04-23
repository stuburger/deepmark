import { z } from "zod/v4"

// ============================================
// MARK SCHEME TYPES
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
 * A stimulus (case study / source / item / figure / table) the question
 * references. Rendered into the grading prompt so the marker judges the
 * answer *against the stimulus context*, not in isolation.
 */
export interface QuestionStimulusContext {
	label: string
	content: string
}

/** A question with its mark scheme, adapted for GCSE (written | multiple_choice). */
export interface QuestionWithMarkScheme {
	id: string
	questionType: "written" | "multiple_choice"
	questionText: string
	topic: string
	rubric: string
	guidance?: string | null
	totalPoints: number
	markPoints: GcseMarkPoint[]
	correctOptionLabels?: string[]
	availableOptions?: Array<{ optionLabel: string; optionText: string }>
	markingMethod?: "deterministic" | "point_based" | "level_of_response"
	/** Rich markdown content — indicative content, exemplar answers, marker notes, level descriptors.
	 *  Primary source of question-specific marking guidance for LoR. */
	content?: string | null
	/**
	 * Stimuli the question references ("Item A", "Source B", …), in the order
	 * they should be presented. Empty/omitted for questions with no attached
	 * case study.
	 */
	stimuli?: QuestionStimulusContext[]
}

/** Response parsed from student submission. */
export interface ParsedResponse {
	questionId: string
	answer: string
}

/** Learning content for providing context and feedback (optional). */
export interface LearningContentItem {
	id: string
	title: string
	slug: string
	content: string
	order: number
}

// ============================================
// MARK POINT RESULT
// ============================================

export const MarkPointResultSchema = z.object({
	pointNumber: z.number(),
	awarded: z.boolean(),
	reasoning: z
		.string()
		.describe(
			"One sentence, max 15 words: why awarded or not. Quote key student phrase or state what was missing.",
		),
	expectedCriteria: z
		.string()
		.describe("What the mark scheme expected for this point"),
	studentCovered: z
		.string()
		.describe("What the student actually covered in their answer"),
})

export type MarkPointResultGrade = z.infer<typeof MarkPointResultSchema>

// ============================================
// DISCRIMINATED QUESTION GRADE UNION
// ============================================

/** Common fields shared by all marking method grading results. */
export type QuestionGradeBase = {
	questionId: string
	markPointsResults: MarkPointResultGrade[]
	totalScore: number
	maxPossibleScore: number
	scorePercentage: number
	passed: boolean
	llmReasoning: string
	feedbackSummary: string
	correctAnswer: string
	relevantLearningSnippet: string
	whatWentWell: string[]
	whatDidntGoWell: string[]
}

/** MCQ grading result — deterministic, no LLM fields beyond base. */
export type McqQuestionGrade = QuestionGradeBase & {
	markingMethod: "deterministic"
}

/** Point-based grading result — LLM-graded written answers. */
export type PointBasedQuestionGrade = QuestionGradeBase & {
	markingMethod: "point_based"
}

/** Level-of-Response grading result — LoR-specific fields are required. */
export type LoRQuestionGrade = QuestionGradeBase & {
	markingMethod: "level_of_response"
	levelAwarded: number
	whyNotNextLevel: string
	capApplied: string
}

/**
 * Discriminated union of grading results. Narrow on `markingMethod`
 * to access variant-specific fields (e.g. `grade.levelAwarded` is only
 * accessible after checking `grade.markingMethod === "level_of_response"`).
 */
export type QuestionGrade =
	| McqQuestionGrade
	| PointBasedQuestionGrade
	| LoRQuestionGrade

// ============================================
// AGGREGATE TYPES
// ============================================

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
	/** Exam-wide level descriptors provided by the teacher (appended to LoR prompts). */
	levelDescriptors?: string
}

export interface GraderOptions {
	systemPrompt?: string
	/** Call site key for config lookup. Defaults to "grading". */
	callSiteKey?: string
}

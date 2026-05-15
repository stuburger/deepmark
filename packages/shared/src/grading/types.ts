import { z } from "zod/v4"
import type { LlmTimeoutMs } from "../llm/runner"

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
 *
 * `content_type` disambiguates how `content` should be interpreted:
 *   - "text"  — prose / markdown-ish plain text (default)
 *   - "table" — a GitHub-flavoured markdown pipe-table
 *   - "image" — reserved; `content` is an S3 key, not yet wired into
 *               multimodal grading prompts
 */
export interface QuestionStimulusContext {
	label: string
	content: string
	contentType?: "text" | "table" | "image"
}

/**
 * AO weight allocation as printed on the mark scheme. Canonical
 * dimensionality field for LoR marking — the marker iterates this. Empty
 * array = no printed AO breakdown (treat as single virtual "Overall"
 * dimension). Length 1 = single-skill LoR. Length 2+ = multi-skill (parallel
 * grids summed, e.g. Edexcel English Lang Sec B AO5+AO6).
 */
export interface AoAllocation {
	aoCode: string
	marks: number
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
	/**
	 * AO weight breakdown printed on the mark scheme. Drives the LoR marker's
	 * iteration: one award per allocation. Empty/omitted = single virtual
	 * "Overall" dimension covering totalPoints (the AQA single-grid case).
	 */
	aoAllocations?: AoAllocation[]
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

/**
 * A discrete descriptor evaluation — one decision per descriptor bullet at
 * the awarded Level and the next Level. The combination of {met, evidence}
 * is what makes LoR marking repeatable: a marker that can't fudge a discrete
 * decision can't drift across runs.
 */
export type DescriptorEvaluation = {
	/** Verbatim descriptor bullet text from the mark scheme. */
	descriptor: string
	/** Did the response demonstrate this descriptor? */
	met: boolean
	/**
	 * Verbatim quote (when met) or short gap description (when not met) from
	 * the student response. Empty allowed only when the descriptor is
	 * structurally inapplicable.
	 */
	evidence: string
}

/**
 * One Assessment Objective award. For single-skill LoR, `aoAwards.length === 1`
 * with aoCode = "Overall" (or the printed AO code if one is printed). For
 * multi-skill LoR (parallel grids), one entry per dimension; aggregate score
 * = sum of awardedMarks across awards.
 */
export type AoAward = {
	aoCode: string
	levelAwarded: number
	awardedMarks: number
	maxMarks: number
	/**
	 * Discrete evaluations at the awarded Level and the next Level. The
	 * awarded Level descriptors should be mostly met; the next-Level
	 * descriptors should be mostly not-met (with evidence either way).
	 */
	descriptorEvaluations: DescriptorEvaluation[]
	whyNotNextLevel: string
}

/** Level-of-Response grading result — LoR-specific fields are required. */
export type LoRQuestionGrade = QuestionGradeBase & {
	markingMethod: "level_of_response"
	/**
	 * Headline Level (mirrors aoAwards[0].levelAwarded for single-skill;
	 * for multi-skill represents the primary AO's Level — UI consumers should
	 * prefer aoAwards[] for per-dimension display).
	 */
	levelAwarded: number
	whyNotNextLevel: string
	capApplied: string
	/**
	 * One award per dimension iterated from the question's aoAllocations
	 * (or a single virtual "Overall" entry when no AO breakdown is printed).
	 * `totalScore` MUST equal sum of `awardedMarks` across awards.
	 */
	aoAwards: AoAward[]
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
	/**
	 * Per-attempt wall-clock budget forwarded to every runner.call().
	 * Pass a thunk (e.g. derived from a Lambda envelope) so the fallback
	 * chain sees a fresh budget on each retry.
	 */
	timeoutMs?: LlmTimeoutMs
}

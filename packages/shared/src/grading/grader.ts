import { Output, generateText } from "ai"
import type { LlmRunner, LlmTimeoutMs } from "../llm/runner"
import { buildBatchPrompt } from "./prompts/batch"
import { buildLoRPrompt } from "./prompts/lor"
import { buildPointBasedPrompt } from "./prompts/point-based"
import {
	BatchGradeSchema,
	LoRQuestionGradeSchema,
	QuestionGradeSchema,
} from "./schemas"
import { computeGradeMetrics } from "./score"
import type {
	AssessmentGrade,
	GradeResponsesInput,
	GradeSingleResponseInput,
	GraderOptions,
	LoRQuestionGrade,
	PointBasedQuestionGrade,
	QuestionGrade,
} from "./types"

const DEFAULT_SYSTEM_PROMPT =
	"You are an expert GCSE examiner. Mark the student's answer against the provided mark scheme. Return valid JSON matching the schema. Ignore spelling and grammar; focus on understanding and correct science. Be consistent and conservative: only award marks when there is clear evidence."

const DEFAULT_CALL_SITE_KEY = "grading"

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}

/**
 * Thin LLM wrapper for grading student answers.
 * Prompt construction is delegated to pure functions in prompts/.
 * Score computation is delegated to score.ts.
 *
 * Accepts an LlmRunner which handles config loading, model resolution,
 * fallback, and snapshot recording. Each generateText call goes through
 * runner.call() — the same path as every other LLM call site.
 */
export class Grader {
	private runner: LlmRunner
	private callSiteKey: string
	private systemPrompt: string
	private timeoutMs: LlmTimeoutMs | undefined

	constructor(runner: LlmRunner, options?: GraderOptions) {
		this.runner = runner
		this.callSiteKey = options?.callSiteKey ?? DEFAULT_CALL_SITE_KEY
		this.systemPrompt = options?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
		this.timeoutMs = options?.timeoutMs
	}

	/** Grade multiple questions in a single LLM call (point-based only). */
	async gradeResponses(input: GradeResponsesInput): Promise<AssessmentGrade> {
		const { questions, responses, learningContent = [] } = input
		const prompt = buildBatchPrompt(questions, responses, learningContent)

		const output = await this.runner.call(
			this.callSiteKey,
			async (model, entry, report, signal) => {
				const result = await generateText({
					model,
					abortSignal: signal,
					temperature: entry.temperature,
					messages: [
						{ role: "system", content: this.systemPrompt },
						{ role: "user", content: prompt },
					],
					output: Output.object({ schema: BatchGradeSchema }),
				})
				report.usage = result.usage
				return result.output
			},
			{ timeoutMs: this.timeoutMs },
		)

		const grades: QuestionGrade[] = output.questionGrades.map((aiGrade) => {
			const question = questions.find((q) => q.id === aiGrade.questionId)
			if (!question) {
				throw new Error(`Question not found for ID: ${aiGrade.questionId}`)
			}
			const metrics = computeGradeMetrics(aiGrade, question)
			return {
				...aiGrade,
				...metrics,
				markingMethod: "point_based" as const,
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

	/** Grade a single point-based question. */
	async gradeSingleResponse(
		input: GradeSingleResponseInput,
	): Promise<PointBasedQuestionGrade> {
		const {
			question,
			answer,
			questionNumber,
			totalQuestions,
			learningContent,
		} = input
		const prompt = buildPointBasedPrompt(
			question,
			answer,
			questionNumber,
			totalQuestions,
			learningContent,
		)

		const output = await this.runner.call(
			this.callSiteKey,
			async (model, entry, report, signal) => {
				const result = await generateText({
					model,
					abortSignal: signal,
					temperature: entry.temperature,
					messages: [
						{ role: "system", content: this.systemPrompt },
						{ role: "user", content: prompt },
					],
					output: Output.object({ schema: QuestionGradeSchema }),
				})
				report.usage = result.usage
				return result.output
			},
			{ timeoutMs: this.timeoutMs },
		)

		const metrics = computeGradeMetrics(output, question)
		return {
			...output,
			...metrics,
			questionId: question.id,
			markingMethod: "point_based" as const,
		}
	}

	/** Grade a single Level-of-Response question. */
	async gradeSingleResponseLoR(
		input: GradeSingleResponseInput,
	): Promise<LoRQuestionGrade> {
		const {
			question,
			answer,
			questionNumber,
			totalQuestions,
			learningContent,
			levelDescriptors,
		} = input
		const prompt = buildLoRPrompt(
			question,
			answer,
			questionNumber,
			totalQuestions,
			learningContent,
			levelDescriptors,
		)

		const output = await this.runner.call(
			this.callSiteKey,
			async (model, entry, report, signal) => {
				const result = await generateText({
					model,
					abortSignal: signal,
					temperature: entry.temperature,
					messages: [
						{ role: "system", content: this.systemPrompt },
						{ role: "user", content: prompt },
					],
					output: Output.object({ schema: LoRQuestionGradeSchema }),
				})
				report.usage = result.usage
				return result.output
			},
			{ timeoutMs: this.timeoutMs },
		)

		const maxPossibleScore = question.totalPoints

		// Reconcile aoAwards: clamp each to its band; recompute total from the
		// per-award sum. The LLM's claimed totalScore is the headline number,
		// but aoAwards is the canonical data — if the LLM's arithmetic is off,
		// trust the per-award sum.
		// `.int()` removed from the LLM-facing schema (Anthropic + Gemini both
		// reject min/max-bounded integers in structured-output schemas, which
		// is what Zod v4 emits for `.int()`). Round here so the downstream
		// shape stays integer.
		const aoAwards = output.aoAwards.map((a) => ({
			...a,
			levelAwarded: Math.round(a.levelAwarded),
			maxMarks: Math.round(a.maxMarks),
			awardedMarks: clamp(Math.round(a.awardedMarks), 0, Math.round(a.maxMarks)),
		}))
		const sumFromAwards = aoAwards.reduce((s, a) => s + a.awardedMarks, 0)
		const totalScore = Math.min(
			Math.max(0, sumFromAwards || Math.round(output.totalScore)),
			maxPossibleScore,
		)
		const scorePercentage =
			maxPossibleScore > 0
				? Math.round((totalScore / maxPossibleScore) * 100)
				: 0

		return {
			...output,
			levelAwarded: Math.round(output.levelAwarded),
			aoAwards,
			questionId: question.id,
			totalScore,
			maxPossibleScore,
			scorePercentage,
			passed: totalScore > 0,
			markingMethod: "level_of_response" as const,
		}
	}
}

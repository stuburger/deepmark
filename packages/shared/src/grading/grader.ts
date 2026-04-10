import { type LanguageModel, Output, generateText } from "ai"
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

/**
 * Thin LLM wrapper for grading student answers.
 * Prompt construction is delegated to pure functions in prompts/.
 * Score computation is delegated to score.ts.
 *
 * Accepts a single LanguageModel or an ordered fallback chain.
 * When multiple models are provided, each generateText call tries
 * the primary model first, then falls back to the next on error.
 */
export class Grader {
	private models: LanguageModel[]
	private systemPrompt: string

	constructor(
		models: LanguageModel | LanguageModel[],
		options?: GraderOptions,
	) {
		this.models = Array.isArray(models) ? models : [models]
		if (this.models.length === 0) {
			throw new Error("Grader requires at least one model")
		}
		this.systemPrompt = options?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
	}

	/** Try each model in the fallback chain until one succeeds. */
	private async generate<T>(
		fn: (model: LanguageModel) => Promise<T>,
	): Promise<T> {
		let lastError: unknown
		for (const model of this.models) {
			try {
				return await fn(model)
			} catch (err) {
				lastError = err
			}
		}
		throw lastError
	}

	/** Grade multiple questions in a single LLM call (point-based only). */
	async gradeResponses(input: GradeResponsesInput): Promise<AssessmentGrade> {
		const { questions, responses, learningContent = [] } = input
		const prompt = buildBatchPrompt(questions, responses, learningContent)

		const { output } = await this.generate((model) =>
			generateText({
				model,
				messages: [
					{ role: "system", content: this.systemPrompt },
					{ role: "user", content: prompt },
				],
				output: Output.object({ schema: BatchGradeSchema }),
			}),
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

		const { output } = await this.generate((model) =>
			generateText({
				model,
				messages: [
					{ role: "system", content: this.systemPrompt },
					{ role: "user", content: prompt },
				],
				output: Output.object({ schema: QuestionGradeSchema }),
			}),
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

		const { output } = await this.generate((model) =>
			generateText({
				model,
				messages: [
					{ role: "system", content: this.systemPrompt },
					{ role: "user", content: prompt },
				],
				output: Output.object({ schema: LoRQuestionGradeSchema }),
			}),
		)

		const maxPossibleScore = question.totalPoints
		const totalScore = Math.min(output.totalScore, maxPossibleScore)
		const scorePercentage =
			maxPossibleScore > 0
				? Math.round((totalScore / maxPossibleScore) * 100)
				: 0

		return {
			...output,
			questionId: question.id,
			totalScore,
			maxPossibleScore,
			scorePercentage,
			passed: totalScore > 0,
			markingMethod: "level_of_response" as const,
			levelAwarded: output.levelAwarded,
			whyNotNextLevel: output.whyNotNextLevel,
			capApplied: output.capApplied,
			whatWentWell: output.whatWentWell,
			whatDidntGoWell: output.whatDidntGoWell,
		}
	}
}

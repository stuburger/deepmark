import type { GradingResult } from "@/lib/grading/grade-questions"
import type { MarkScheme } from "@/lib/grading/question-list"
import { logger } from "@/lib/infra/logger"
import {
	type LlmRunner,
	type QuestionStimulusContext,
	parseMarkPointsFromPrisma,
} from "@mcp-gcse/shared"
import type { AnnotationContext } from "./data-loading"
import { annotateOneQuestion } from "./llm-annotations"
import type { PendingAnnotation } from "./types"

const TAG = "annotate-result"

export type AnnotateOneResultArgs = {
	result: GradingResult
	stimuli?: QuestionStimulusContext[]
	markScheme: MarkScheme | null
	annotationContext: AnnotationContext
	annotationLlm: LlmRunner
	jobId: string
}

/**
 * Annotate a single graded question. Runs immediately after grading within the
 * same per-question task so the two stay close in flight time. MCQ and
 * point-based use deterministic helpers; everything else goes through the LLM.
 *
 * Wrapped in a try/catch so one question's annotation failure doesn't sink
 * the grade — recoverable errors are logged and swallowed (empty array),
 * programming bugs bubble up via `isRecoverableAnnotationError`.
 */
export async function annotateOneResult({
	result,
	stimuli,
	markScheme,
	annotationContext,
	annotationLlm,
	jobId,
}: AnnotateOneResultArgs): Promise<PendingAnnotation[]> {
	const { allTokens, regionByQuestion, examBoard, levelDescriptors, subject } =
		annotationContext

	const method = result.marking_method ?? markScheme?.marking_method ?? null
	const region = regionByQuestion.get(result.question_id)

	try {
		// Point-based and deterministic MCQ "annotations" used to produce a
		// summary tick/cross with bbox-only positioning (no token anchor).
		// That information is now carried as `awardedScore` on the
		// `questionAnswer` block — see `setQuestionScore`. Renderers draw
		// the tick/cross themselves from `awardedScore` vs `maxScore`. Only
		// LoR-style token-anchored annotations flow through this pipeline.
		if (method === "point_based" || method === "deterministic") {
			return []
		}
		return await annotateOneQuestion({
			gradingResult: result,
			stimuli,
			allTokens,
			examBoard,
			levelDescriptors,
			subject,
			markScheme: markScheme
				? {
						description: markScheme.description,
						guidance: markScheme.guidance,
						mark_points: parseMarkPointsFromPrisma(markScheme.mark_points),
						marking_method: markScheme.marking_method,
						content: markScheme.content,
					}
				: null,
			llm: annotationLlm,
			jobId,
		})
	} catch (err) {
		if (!isRecoverableAnnotationError(err)) throw err
		logger.warn(TAG, "Annotation failed for question — preserving grade", {
			jobId,
			question_id: result.question_id,
			error: String(err),
		})
		return []
	}
}

/**
 * Annotation failure recovery policy.
 *
 * We default to "recoverable" — grading has already succeeded for this question,
 * so losing its annotations is better than crashing the job. The narrow
 * exceptions below are for errors that can only originate in our own code:
 *
 * - ReferenceError: using an undefined variable/identifier. Not produced by
 *   @ai-sdk/google, zod, fetch, or JSON.parse in any normal path.
 * - RangeError: stack overflow (infinite recursion) or illegal numeric/array
 *   bounds. Also only comes from programming mistakes.
 *
 * Intentionally recoverable (do NOT blacklist):
 * - TypeError: Node fetch() throws TypeError on network failures ("fetch failed").
 *   Some SDKs surface these as-is rather than wrapping in APICallError.
 * - SyntaxError: JSON.parse throws SyntaxError on malformed model output. Any
 *   SDK call that parses JSON internally without wrapping can leak one.
 * - AISDKError / APICallError / TypeValidationError / NoObjectGeneratedError /
 *   JSONParseError / ZodError / generic Error / AbortError: all plausibly
 *   external and should not sink the grade.
 *
 * If this turns out to let a real bug hide, the failure will still log with
 * stack trace (see annotateOneResult's catch). Adjust the blacklist if that
 * happens — do not silently broaden it without evidence.
 */
export function isRecoverableAnnotationError(err: unknown): boolean {
	if (!(err instanceof Error)) return true
	if (err instanceof ReferenceError || err instanceof RangeError) return false
	return true
}

import { db } from "@/db"
import type { GradingResult } from "@/lib/grading/grade-questions"
import type { MarkScheme } from "@/lib/grading/question-list"
import { logger } from "@/lib/infra/logger"
import type {
	AoAwardRow,
	LlmRunner,
	LlmTimeoutMs,
	MarkPointResult,
} from "@mcp-gcse/shared"
import { annotateOneResult } from "./annotate-result"
import { loadAnnotationContext } from "./data-loading"
import type { PendingAnnotation } from "./types"

const TAG = "regenerate-annotations"

export type RegenerateAnnotationsArgs = {
	markingResultId: string
	llm: LlmRunner
	/**
	 * Identifier surfaced into log lines so re-annotation traces are
	 * distinguishable from the original grading run. Defaults to
	 * `"regen:<markingResultId>"`.
	 */
	jobId?: string
	timeoutMs?: LlmTimeoutMs
}

export type RegenerateAnnotationsResult = {
	annotations: PendingAnnotation[]
	gradingResult: GradingResult
}

/**
 * Re-runs the annotation LLM against a previously-graded question, loading
 * every input from the DB rather than carrying them through in-memory from a
 * live grading run. Pure with respect to side effects — does NOT write to
 * Y.Doc, projection rows, or annotation tables. Just returns the new
 * `PendingAnnotation[]` so the caller can compare, persist, or display.
 *
 * Use cases:
 *   - Re-running annotation against historical fixtures after a prompt change
 *     ("how did the rework affect Jaufferdeen Q6?")
 *   - A/B comparing two model configs against the same submission
 *     (`createLlmRunner({ "llm-annotations": [...] })` per run)
 *   - Replay scripts when investigating teacher feedback ("regenerate this
 *     and see whether the new prompt would catch what they flagged")
 *
 * NOT for the live grading path — that already runs annotation inline. Use
 * this only when the grade is already committed and you want a fresh
 * annotation pass.
 *
 * Returns `null` when the marking_result row doesn't have a linked mark
 * scheme, since the annotation pipeline can't anchor without one.
 */
export async function regenerateAnnotationsFromDb({
	markingResultId,
	llm,
	jobId,
	timeoutMs,
}: RegenerateAnnotationsArgs): Promise<RegenerateAnnotationsResult | null> {
	const inputs = await loadAnnotationInputsForMarkingResult(markingResultId)
	if (!inputs) return null

	const annotations = await annotateOneResult({
		result: inputs.gradingResult,
		markScheme: inputs.markScheme,
		annotationContext: inputs.annotationContext,
		annotationLlm: llm,
		jobId: jobId ?? `regen:${markingResultId}`,
		timeoutMs,
	})

	logger.info(TAG, "Regenerated annotations", {
		markingResultId,
		questionId: inputs.gradingResult.question_id,
		count: annotations.length,
	})

	return { annotations, gradingResult: inputs.gradingResult }
}

type LoadedInputs = {
	gradingResult: GradingResult
	markScheme: MarkScheme | null
	annotationContext: Awaited<ReturnType<typeof loadAnnotationContext>>
	submissionId: string
}

/**
 * Reconstructs the inputs the live grading path would have had in memory,
 * from the marking_results row + its joins. Separated from
 * `regenerateAnnotationsFromDb` so callers that want to inspect the inputs
 * without firing the LLM (debug tools, fixture generators) can reuse this.
 *
 * Returns `null` when the row can't be reconstituted — wrong id, no
 * mark scheme link, etc. Callers should treat null as "not annotatable",
 * not as a recoverable error.
 */
export async function loadAnnotationInputsForMarkingResult(
	markingResultId: string,
): Promise<LoadedInputs | null> {
	const mr = await db.markingResult.findUnique({
		where: { id: markingResultId },
		select: {
			id: true,
			mark_scheme_id: true,
			total_score: true,
			max_possible_score: true,
			llm_reasoning: true,
			feedback_summary: true,
			level_awarded: true,
			why_not_next_level: true,
			cap_applied: true,
			mark_points_results: true,
			ao_awards: true,
			what_went_well: true,
			even_better_if: true,
			answer: {
				select: {
					id: true,
					submission_id: true,
					question_id: true,
					student_answer: true,
					question: {
						select: {
							id: true,
							question_number: true,
							// DB column is `text`; GradingResult exposes it as `question_text`.
							text: true,
						},
					},
				},
			},
			mark_scheme: {
				select: {
					id: true,
					description: true,
					guidance: true,
					marking_method: true,
					content: true,
					mark_points: true,
				},
			},
		},
	})
	if (!mr) {
		logger.warn(TAG, "MarkingResult not found", { markingResultId })
		return null
	}
	if (!mr.mark_scheme) {
		logger.warn(
			TAG,
			"MarkingResult has no linked mark scheme — cannot annotate",
			{
				markingResultId,
			},
		)
		return null
	}

	const submissionId = mr.answer.submission_id

	const gradingResult: GradingResult = {
		_v: 1,
		question_id: mr.answer.question.id,
		question_number: mr.answer.question.question_number ?? "",
		question_text: mr.answer.question.text,
		student_answer: mr.answer.student_answer,
		awarded_score: mr.total_score,
		max_score: mr.max_possible_score,
		llm_reasoning: mr.llm_reasoning,
		feedback_summary: mr.feedback_summary,
		marking_method: mr.mark_scheme.marking_method,
		mark_points_results:
			(mr.mark_points_results as MarkPointResult[] | null) ?? [],
		mark_scheme_id: mr.mark_scheme_id,
		...(mr.level_awarded != null ? { level_awarded: mr.level_awarded } : {}),
		...(mr.why_not_next_level
			? { why_not_next_level: mr.why_not_next_level }
			: {}),
		...(mr.cap_applied ? { cap_applied: mr.cap_applied } : {}),
		...(Array.isArray(mr.ao_awards) && mr.ao_awards.length > 0
			? { ao_awards: mr.ao_awards as AoAwardRow[] }
			: {}),
		...(mr.what_went_well.length > 0
			? { what_went_well: mr.what_went_well }
			: {}),
		...(mr.even_better_if.length > 0
			? { even_better_if: mr.even_better_if }
			: {}),
	}

	const annotationContext = await loadAnnotationContext(submissionId)

	return {
		gradingResult,
		// Cast: Prisma's MarkScheme select shape matches the loader's MarkScheme
		// type (description, guidance, marking_method, content, mark_points).
		// We don't include every Prisma column but `annotateOneResult` only
		// reads these fields, so the select is intentionally narrow.
		markScheme: mr.mark_scheme as unknown as MarkScheme,
		annotationContext,
		submissionId,
	}
}

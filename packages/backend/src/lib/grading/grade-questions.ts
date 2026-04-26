import { db } from "@/db"
import { annotateOneResult } from "@/lib/annotations/annotate-result"
import type { AnnotationContext } from "@/lib/annotations/data-loading"
import type { PendingAnnotation } from "@/lib/annotations/types"
import {
	type QuestionGradeAttrs,
	setQuestionGrade,
} from "@/lib/collab/editor-ops"
import type { HeadlessEditor } from "@/lib/collab/headless-editor"
import type {
	ExamPaperWithSections,
	MarkScheme,
	QuestionListItem,
} from "@/lib/grading/question-list"
import type { CancellationToken } from "@/lib/infra/cancellation"
import { logger } from "@/lib/infra/logger"
import { dispatchAnnotationsForQuestion } from "@/processors/student-paper-grade/annotations-to-editor"
import { logGradingRunEvent } from "@mcp-gcse/db"
import {
	type LlmRunner,
	type MarkerContext,
	type MarkerOrchestrator,
	type PageToken,
	type QuestionWithMarkScheme,
	parseMarkPointsFromPrisma,
} from "@mcp-gcse/shared"

const TAG = "grade-questions"

export type MarkPointResultEntry = {
	pointNumber: number
	awarded: boolean
	reasoning: string
	expectedCriteria?: string
	studentCovered?: string
}

export type GradingResult = {
	_v: 1
	question_id: string
	question_number: string
	question_text: string
	student_answer: string
	awarded_score: number
	max_score: number
	llm_reasoning: string
	feedback_summary: string
	marking_method: "deterministic" | "point_based" | "level_of_response" | null
	level_awarded?: number
	why_not_next_level?: string
	cap_applied?: string
	what_went_well?: string[]
	even_better_if?: string[]
	mark_points_results: MarkPointResultEntry[]
	mark_scheme_id: string | null
}

export type GradeAndAnnotateAllArgs = {
	questionList: QuestionListItem[]
	/** Keyed by canonical question_id. */
	answerMap: Map<string, string>
	examPaper: ExamPaperWithSections
	orchestrator: MarkerOrchestrator
	jobId: string
	cancellation: CancellationToken
	annotationContext: AnnotationContext
	annotationLlm: LlmRunner
	/**
	 * Live editor session owned by the grade Lambda. Per-question annotation
	 * marks are dispatched against this editor as soon as each question
	 * finishes, so the teacher sees marks appear progressively. The grade
	 * Lambda opens this editor once at handler start and closes it after all
	 * questions complete — see `student-paper-grade.ts`.
	 */
	editor: HeadlessEditor
	/** Per-question OCR tokens, preloaded once for the whole submission. */
	tokensByQuestion: Map<string, PageToken[]>
}

export type GradeAndAnnotateAllOutput = {
	results: GradingResult[]
	annotationsByQuestion: Map<string, PendingAnnotation[]>
}

/**
 * Grades and annotates all questions in parallel, writing incremental grading
 * results to the DB as each one completes so the frontend can stream live
 * feedback. Annotation runs immediately after grading within the same per-
 * question task so the two stay close in flight time.
 *
 * Results are committed into pre-allocated index slots so the array always
 * reflects exam question order regardless of which LLM call finishes first.
 * Incremental DB writes are fire-and-forget; the final authoritative write
 * happens in completeGradingJob.
 */
export async function gradeAndAnnotateAll(
	args: GradeAndAnnotateAllArgs,
): Promise<GradeAndAnnotateAllOutput> {
	const {
		questionList,
		answerMap,
		examPaper,
		orchestrator,
		jobId,
		cancellation,
		annotationContext,
		annotationLlm,
		editor,
		tokensByQuestion,
	} = args

	// Pre-allocate slots to maintain question order during streaming updates.
	const resultSlots: (GradingResult | undefined)[] = new Array(
		questionList.length,
	).fill(undefined)
	const annotationsByQuestion = new Map<string, PendingAnnotation[]>()

	await Promise.all(
		questionList.map(async (qItem, index) => {
			if (!qItem) return

			if (cancellation.isCancelled()) {
				logger.info(TAG, "Job cancelled — skipping question", {
					jobId,
					question_id: qItem.question_id,
				})
				return
			}

			const result = await gradeOneQuestion({
				qItem,
				answerMap,
				examPaper,
				orchestrator,
				jobId,
			})

			resultSlots[index] = result

			// Dispatch the full grade payload to the editor as soon as it's
			// known. The doc is the source of truth for grade metadata
			// (awarded score, WWW/EBI, feedback, level data, mark-points
			// breakdown, etc.) — renderers read it directly via the
			// NodeView, the projection Lambda mirrors it to
			// `GradingRun.grading_results` JSON for non-realtime consumers
			// (analytics, exports, batch listings). No direct PG write
			// happens here — the projection picks up the change on the
			// next Hocuspocus snapshot debounce (~2s).
			editor.transact((view) =>
				setQuestionGrade(view, result.question_id, gradingResultToAttrs(result)),
			)

			if (cancellation.isCancelled()) return

			const annotations = await annotateOneResult({
				result,
				stimuli:
					qItem.question_obj.question_stimuli.length > 0
						? qItem.question_obj.question_stimuli.map((qs) => ({
								label: qs.stimulus.label,
								content: qs.stimulus.content,
								contentType: qs.stimulus.content_type,
							}))
						: undefined,
				markScheme: qItem.mark_scheme,
				annotationContext,
				annotationLlm,
				jobId,
			})
			annotationsByQuestion.set(result.question_id, annotations)

			// Dispatch this question's annotation marks to the editor as soon as
			// they're computed — teacher sees marks fill in block-by-block as
			// the parallel grade pass progresses, no batched end-of-run flush.
			dispatchAnnotationsForQuestion({
				editor,
				jobId,
				questionId: result.question_id,
				answerText: result.student_answer,
				tokens: tokensByQuestion.get(result.question_id) ?? [],
				annotations,
			})
		}),
	)

	return {
		results: resultSlots.filter((r): r is GradingResult => r !== undefined),
		annotationsByQuestion,
	}
}

// ─── Per-question grading ──────────────────────────────────────────────────────

type GradeOneQuestionArgs = {
	qItem: QuestionListItem
	answerMap: Map<string, string>
	examPaper: ExamPaperWithSections
	orchestrator: MarkerOrchestrator
	jobId: string
}

async function gradeOneQuestion({
	qItem,
	answerMap,
	examPaper,
	orchestrator,
	jobId,
}: GradeOneQuestionArgs): Promise<GradingResult> {
	const studentAnswer = answerMap.get(qItem.question_id) ?? ""
	const ms = qItem.mark_scheme

	if (!studentAnswer.trim()) {
		logger.info(TAG, "No answer provided — awarding 0", {
			jobId,
			question_id: qItem.question_id,
			question_number: qItem.question_number,
		})
		return {
			_v: 1 as const,
			question_id: qItem.question_id,
			question_number: qItem.question_number,
			question_text: qItem.question_text,
			student_answer: studentAnswer,
			awarded_score: 0,
			max_score: ms?.points_total ?? qItem.question_obj.points ?? 0,
			llm_reasoning: "No answer provided by the student.",
			feedback_summary: "No answer was provided for this question.",
			marking_method:
				(ms?.marking_method as GradingResult["marking_method"]) ?? null,
			what_went_well: [],
			even_better_if: [],
			mark_points_results: [],
			mark_scheme_id: ms?.id ?? null,
		}
	}

	if (!ms) {
		logger.warn(TAG, "No mark scheme for question — skipping grade", {
			jobId,
			question_id: qItem.question_id,
			question_number: qItem.question_number,
		})
		return {
			_v: 1 as const,
			question_id: qItem.question_id,
			question_number: qItem.question_number,
			question_text: qItem.question_text,
			student_answer: studentAnswer,
			awarded_score: 0,
			max_score: qItem.question_obj.points ?? 0,
			llm_reasoning: "No mark scheme available for this question.",
			feedback_summary: "No mark scheme available.",
			marking_method: null,
			mark_points_results: [],
			mark_scheme_id: null,
		}
	}

	const questionWithScheme = buildQuestionWithScheme(qItem, ms, examPaper)

	logger.info(TAG, "Grading question", {
		jobId,
		question_number: qItem.question_number,
		question_id: qItem.question_id,
		marking_method: ms.marking_method,
	})

	const markerContext: MarkerContext = {
		levelDescriptors: examPaper.level_descriptors ?? undefined,
	}

	try {
		const grade = await orchestrator.mark(
			questionWithScheme,
			studentAnswer,
			markerContext,
		)

		logger.info(TAG, "Question graded", {
			jobId,
			question_number: qItem.question_number,
			awarded: grade.totalScore,
			max: grade.maxPossibleScore,
		})
		void logGradingRunEvent(db, jobId, {
			type: "question_graded",
			at: new Date().toISOString(),
			question_number: qItem.question_number,
			awarded: grade.totalScore,
			max: grade.maxPossibleScore,
		})

		const isLoR = grade.markingMethod === "level_of_response"

		return {
			_v: 1 as const,
			question_id: qItem.question_id,
			question_number: qItem.question_number,
			question_text: qItem.question_text,
			student_answer: studentAnswer,
			awarded_score: grade.totalScore,
			max_score: grade.maxPossibleScore,
			llm_reasoning: grade.llmReasoning,
			feedback_summary: grade.feedbackSummary,
			marking_method: ms.marking_method as GradingResult["marking_method"],
			level_awarded: isLoR ? grade.levelAwarded : undefined,
			why_not_next_level: isLoR ? grade.whyNotNextLevel : undefined,
			cap_applied: isLoR ? grade.capApplied : undefined,
			what_went_well: grade.whatWentWell,
			even_better_if: grade.whatDidntGoWell,
			mark_points_results: grade.markPointsResults as MarkPointResultEntry[],
			mark_scheme_id: ms.id,
		}
	} catch (err) {
		logger.error(TAG, "Grading failed for question", {
			jobId,
			question_number: qItem.question_number,
			question_id: qItem.question_id,
			error: String(err),
		})
		const gradingFailedNote = studentAnswer.trim()
			? "You should not be seeing this message. An error has occurred and this answer could not be automatically graded."
			: "No answer was detected for this question. If you did write an answer, try re-scanning or edit the extracted answer and re-mark."
		return {
			_v: 1 as const,
			question_id: qItem.question_id,
			question_number: qItem.question_number,
			question_text: qItem.question_text,
			student_answer: studentAnswer,
			awarded_score: 0,
			max_score: ms.points_total,
			llm_reasoning: `Automatic grading failed for this question (${qItem.question_number}). Manual review required.`,
			feedback_summary: gradingFailedNote,
			marking_method: ms.marking_method as GradingResult["marking_method"],
			mark_points_results: [],
			mark_scheme_id: ms.id,
		}
	}
}

/**
 * Project an in-memory `GradingResult` onto the `QuestionGradeAttrs`
 * shape used by the doc. The two are deliberately field-for-field
 * identical (just camelCased), but kept as separate types so the
 * grade pipeline can evolve internally without dragging the editor
 * schema with it.
 */
function gradingResultToAttrs(r: GradingResult): QuestionGradeAttrs {
	return {
		awardedScore: r.awarded_score,
		markingMethod: r.marking_method,
		llmReasoning: r.llm_reasoning,
		feedbackSummary: r.feedback_summary,
		whatWentWell: r.what_went_well ?? [],
		evenBetterIf: r.even_better_if ?? [],
		markPointsResults: r.mark_points_results,
		levelAwarded: r.level_awarded ?? null,
		whyNotNextLevel: r.why_not_next_level ?? null,
		capApplied: r.cap_applied ?? null,
		markSchemeId: r.mark_scheme_id,
	}
}

function buildQuestionWithScheme(
	qItem: QuestionListItem,
	ms: MarkScheme,
	examPaper: ExamPaperWithSections,
): QuestionWithMarkScheme {
	const rawOptions = qItem.question_obj.multiple_choice_options as
		| Array<{ option_label: string; option_text: string }>
		| null
		| undefined
	const availableOptions = Array.isArray(rawOptions)
		? rawOptions.map((o) => ({
				optionLabel: o.option_label,
				optionText: o.option_text,
			}))
		: undefined

	const stimuli =
		qItem.question_obj.question_stimuli.length > 0
			? qItem.question_obj.question_stimuli.map((qs) => ({
					label: qs.stimulus.label,
					content: qs.stimulus.content,
					contentType: qs.stimulus.content_type,
				}))
			: undefined

	return {
		id: qItem.question_id,
		questionType:
			qItem.question_obj.question_type === "multiple_choice"
				? "multiple_choice"
				: "written",
		questionText: qItem.question_text,
		topic: qItem.question_obj.subject ?? examPaper.subject,
		rubric: ms.description,
		guidance: ms.guidance ?? null,
		totalPoints: ms.points_total,
		markPoints: parseMarkPointsFromPrisma(ms.mark_points),
		correctOptionLabels:
			ms.correct_option_labels?.length > 0
				? ms.correct_option_labels
				: undefined,
		availableOptions,
		markingMethod:
			(ms.marking_method as
				| "deterministic"
				| "point_based"
				| "level_of_response") ?? undefined,
		content: ms.content,
		stimuli,
	}
}

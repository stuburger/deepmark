import { db } from "@/db"
import type { CancellationToken } from "@/lib/infra/cancellation"
import { logger } from "@/lib/infra/logger"
import type {
	ExamPaperWithSections,
	MarkScheme,
	QuestionListItem,
} from "@/lib/grading/question-list"
import { logGradingRunEvent } from "@mcp-gcse/db"
import {
	type MarkerContext,
	type MarkerOrchestrator,
	type QuestionWithMarkScheme,
	parseMarkPointsFromPrisma,
	parseMarkingRulesFromPrisma,
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

export type GradeAllQuestionsArgs = {
	questionList: QuestionListItem[]
	/** Keyed by canonical question_id. */
	answerMap: Map<string, string>
	examPaper: ExamPaperWithSections
	orchestrator: MarkerOrchestrator
	jobId: string
	cancellation: CancellationToken
}

/**
 * Grades all questions in parallel, writing incremental results to the DB as
 * each one completes so the frontend can stream live feedback.
 *
 * Results are committed into pre-allocated index slots so the array always
 * reflects exam question order regardless of which LLM call finishes first.
 * Incremental DB writes are fire-and-forget; the final authoritative write
 * happens in completeGradingJob.
 */
export async function gradeAllQuestions(
	args: GradeAllQuestionsArgs,
): Promise<GradingResult[]> {
	const {
		questionList,
		answerMap,
		examPaper,
		orchestrator,
		jobId,
		cancellation,
	} = args

	// Pre-allocate slots to maintain question order during streaming updates.
	const resultSlots: (GradingResult | undefined)[] = new Array(
		questionList.length,
	).fill(undefined)

	const writeIncremental = () => {
		const completed = resultSlots.filter(
			(r): r is GradingResult => r !== undefined,
		)
		db.gradingRun
			.update({ where: { id: jobId }, data: { grading_results: completed } })
			.catch((err) =>
				logger.warn(
					TAG,
					"Non-fatal: failed to write incremental grading result",
					{
						jobId,
						error: String(err),
					},
				),
			)
	}

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
			writeIncremental()
		}),
	)

	return resultSlots.filter((r): r is GradingResult => r !== undefined)
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
			level_awarded: grade.levelAwarded ?? undefined,
			why_not_next_level: grade.whyNotNextLevel ?? undefined,
			cap_applied: grade.capApplied ?? undefined,
			what_went_well: grade.whatWentWell ?? undefined,
			even_better_if: grade.whatDidntGoWell ?? undefined,
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
			? "This answer could not be automatically graded. Please review it manually against the mark scheme."
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
		markingRules: parseMarkingRulesFromPrisma(ms.marking_rules),
	}
}

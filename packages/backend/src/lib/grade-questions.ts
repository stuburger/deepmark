import { db } from "@/db"
import { normaliseQNum } from "@/lib/answer-alignment"
import type { CancellationToken } from "@/lib/cancellation"
import type { AnswerRegion } from "@/lib/gemini-region"
import { logger } from "@/lib/logger"
import type {
	ExamPaperWithSections,
	QuestionListItem,
} from "@/lib/question-list"
import { logStudentPaperEvent } from "@mcp-gcse/db"
import {
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
	question_id: string
	question_number: string
	question_text: string
	student_answer: string
	awarded_score: number
	max_score: number
	llm_reasoning: string
	feedback_summary: string
	level_awarded?: number
	why_not_next_level?: string
	cap_applied?: string
	mark_points_results: MarkPointResultEntry[]
	mark_scheme_id: string | null
	answer_regions: AnswerRegion[]
}

export type GradeAllQuestionsArgs = {
	questionList: QuestionListItem[]
	answerMap: Map<string, string>
	llmAlignmentMap: Map<string, string>
	examPaper: ExamPaperWithSections
	orchestrator: MarkerOrchestrator
	jobId: string
	cancellation: CancellationToken
}

/**
 * Grades every question in the list, writing incremental results to the DB
 * after each question so the frontend can stream live feedback.
 * Stops early if the cancellation token fires.
 */
export async function gradeAllQuestions(
	args: GradeAllQuestionsArgs,
): Promise<GradingResult[]> {
	const {
		questionList,
		answerMap,
		llmAlignmentMap,
		examPaper,
		orchestrator,
		jobId,
		cancellation,
	} = args

	const gradingResults: GradingResult[] = []

	for (let qi = 0; qi < questionList.length; qi++) {
		const qItem = questionList[qi]
		if (!qItem) continue

		if (cancellation.isCancelled()) {
			logger.info(TAG, "Job cancelled mid-grading — stopping loop", {
				jobId,
				question_id: qItem.question_id,
			})
			break
		}

		const studentAnswer =
			answerMap.get(normaliseQNum(qItem.question_number)) ??
			llmAlignmentMap.get(qItem.question_id) ??
			""
		const ms = qItem.mark_scheme

		if (!ms) {
			logger.warn(TAG, "No mark scheme for question — skipping grade", {
				jobId,
				question_id: qItem.question_id,
				question_number: qItem.question_number,
			})
			gradingResults.push({
				question_id: qItem.question_id,
				question_number: qItem.question_number,
				question_text: qItem.question_text,
				student_answer: studentAnswer,
				awarded_score: 0,
				max_score: qItem.question_obj.points ?? 0,
				llm_reasoning: "No mark scheme available for this question.",
				feedback_summary: "No mark scheme available.",
				mark_points_results: [],
				mark_scheme_id: null,
				answer_regions: [],
			})
		} else {
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

			const questionWithScheme: QuestionWithMarkScheme = {
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

			logger.info(TAG, "Grading question", {
				jobId,
				question_number: qItem.question_number,
				question_id: qItem.question_id,
				marking_method: ms.marking_method,
			})
			try {
				const grade = await orchestrator.mark(questionWithScheme, studentAnswer)
				logger.info(TAG, "Question graded", {
					jobId,
					question_number: qItem.question_number,
					awarded: grade.totalScore,
					max: grade.maxPossibleScore,
				})
				void logStudentPaperEvent(db, jobId, {
					type: "question_graded",
					at: new Date().toISOString(),
					question_number: qItem.question_number,
					awarded: grade.totalScore,
					max: grade.maxPossibleScore,
				})
				gradingResults.push({
					question_id: qItem.question_id,
					question_number: qItem.question_number,
					question_text: qItem.question_text,
					student_answer: studentAnswer,
					awarded_score: grade.totalScore,
					max_score: grade.maxPossibleScore,
					llm_reasoning: grade.llmReasoning,
					feedback_summary: grade.feedbackSummary,
					level_awarded: grade.levelAwarded ?? undefined,
					why_not_next_level: grade.whyNotNextLevel ?? undefined,
					cap_applied: grade.capApplied ?? undefined,
					mark_points_results:
						grade.markPointsResults as MarkPointResultEntry[],
					mark_scheme_id: ms.id,
					answer_regions: [],
				})
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
				gradingResults.push({
					question_id: qItem.question_id,
					question_number: qItem.question_number,
					question_text: qItem.question_text,
					student_answer: studentAnswer,
					awarded_score: 0,
					max_score: ms.points_total,
					llm_reasoning: `Automatic grading failed for this question (${qItem.question_number}). Manual review required.`,
					feedback_summary: gradingFailedNote,
					mark_points_results: [],
					mark_scheme_id: ms.id,
					answer_regions: [],
				})
			}
		}

		// Write the growing results array after every question so the
		// frontend can stream live feedback while grading is in progress.
		// Status stays "processing" — only the final write flips to "ocr_complete".
		await db.studentPaperJob
			.update({
				where: { id: jobId },
				data: { grading_results: gradingResults },
			})
			.catch((err) => {
				logger.warn(
					TAG,
					"Non-fatal: failed to write incremental grading result",
					{
						jobId,
						question_number: qItem.question_number,
						error: String(err),
					},
				)
			})
	}

	return gradingResults
}

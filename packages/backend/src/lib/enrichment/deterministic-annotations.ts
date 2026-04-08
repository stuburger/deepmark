import type { GradingResult } from "@/lib/grading/grade-questions"
import type { NormalisedBox } from "@mcp-gcse/shared"
import type { AnswerRegionRow, PendingAnnotation } from "./types"

/**
 * Creates a single tick or cross annotation for a point-based question.
 * Always a green tick if 1+ marks awarded. The payload includes structured
 * mark point results so the popover can render a checklist.
 * No LLM call — purely derived from grading results.
 */
export function pointBasedAnnotations(
	gradingResult: GradingResult,
	answerRegion: AnswerRegionRow | undefined,
): PendingAnnotation[] {
	if (!answerRegion || gradingResult.mark_points_results.length === 0) return []

	const regionBox = answerRegion.box as NormalisedBox
	const awarded = gradingResult.awarded_score
	const max = gradingResult.max_score

	const tickBox: NormalisedBox = [
		regionBox[0],
		regionBox[1],
		Math.min(regionBox[0] + 30, regionBox[2]),
		Math.min(regionBox[1] + 30, regionBox[3]),
	]

	const markPoints = gradingResult.mark_points_results.map((mp) => ({
		point: mp.pointNumber,
		awarded: mp.awarded,
		criteria: mp.expectedCriteria ?? mp.studentCovered ?? `Point ${mp.pointNumber}`,
	}))

	return [
		{
			questionId: gradingResult.question_id,
			pageOrder: answerRegion.page_order,
			overlayType: "mark",
			sentiment: awarded > 0 ? "positive" : "negative",
			payload: {
				_v: 1,
				signal: awarded > 0 ? "tick" : "cross",
				reason: `${awarded}/${max}`,
				markPoints,
			},
			anchorTokenStartId: null,
			anchorTokenEndId: null,
			bbox: tickBox,
			parentIndex: undefined,
			sortOrder: 0,
		},
	]
}

/**
 * Creates a single tick/cross annotation for an MCQ question.
 * No LLM call — purely from awarded_score vs max_score.
 */
export function deterministicMcqAnnotation(
	gradingResult: GradingResult,
	answerRegion: AnswerRegionRow | undefined,
): PendingAnnotation[] {
	if (!answerRegion) return []

	const correct = gradingResult.awarded_score === gradingResult.max_score
	const bbox = answerRegion.box as NormalisedBox
	const reason = correct
		? `✓ correct — ${gradingResult.awarded_score}/${gradingResult.max_score}`
		: `✗ incorrect — ${gradingResult.awarded_score}/${gradingResult.max_score}`

	return [
		{
			questionId: gradingResult.question_id,
			pageOrder: answerRegion.page_order,
			overlayType: "mark",
			sentiment: correct ? "positive" : "negative",
			payload: {
				_v: 1,
				signal: correct ? "tick" : "cross",
				reason,
			},
			anchorTokenStartId: null,
			anchorTokenEndId: null,
			bbox,
			parentIndex: undefined,
			sortOrder: 0,
		},
	]
}

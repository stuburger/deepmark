import type { Node as PmNode } from "@tiptap/pm/model"
import type { GradingResult, MarkPointResult, McqOption } from "./types"

/**
 * Walks a ProseMirror document and projects every gradeable question
 * (every `questionAnswer` block + every row inside the `mcqTable` atom)
 * into the `GradingResult[]` shape consumed by the projection Lambda
 * (writes to `GradingRun.grading_results` JSON), the dashboards, the
 * PDF/CSV exporters, and the batch summary.
 *
 * The doc is the source of truth for grade metadata; this function is
 * how PG-side consumers get a shape they can write into the existing
 * `grading_results` schema without reaching into Y.Doc internals.
 *
 * Order matches doc order: MCQ table rows come first if the table sits
 * at the top (which it does for `dispatchExtractedDocOps`), then
 * `questionAnswer` blocks in insertion order. Ungraded blocks (no
 * `awardedScore` set) are skipped — same semantics as today's
 * incremental writes which only commit completed slots.
 */
export function deriveGradingResultsFromDoc(doc: PmNode): GradingResult[] {
	const results: GradingResult[] = []

	doc.descendants((node) => {
		if (node.type.name === "mcqTable") {
			const rows = (node.attrs.results as McqTableRow[] | undefined) ?? []
			for (const row of rows) {
				if (row.awardedScore == null) continue
				results.push(mcqRowToGradingResult(row))
			}
			return false
		}

		if (node.type.name === "questionAnswer") {
			const attrs = node.attrs as QuestionAnswerAttrs
			if (attrs.questionId == null) return false
			if (attrs.awardedScore == null) return false
			results.push(questionAnswerToGradingResult(node, attrs))
			return false
		}
	})

	return results
}

// ─── Internal types (mirror the doc schema) ─────────────────────────────────

type McqTableRow = {
	questionId: string
	questionNumber: string
	questionText: string | null
	maxScore: number
	options: McqOption[]
	correctLabels: string[]
	studentAnswer: string | null
	awardedScore: number | null
	markingMethod: GradingResult["marking_method"]
	feedbackSummary: string | null
	llmReasoning: string | null
	whatWentWell: string[]
	evenBetterIf: string[]
	markPointsResults: MarkPointResult[]
	levelAwarded: number | null
	whyNotNextLevel: string | null
	capApplied: string | null
	markSchemeId: string | null
}

type QuestionAnswerAttrs = {
	questionId: string | null
	questionNumber: string | null
	questionText: string | null
	maxScore: number | null
	awardedScore: number | null
	markingMethod: GradingResult["marking_method"]
	llmReasoning: string | null
	feedbackSummary: string | null
	whatWentWell: string[]
	evenBetterIf: string[]
	markPointsResults: MarkPointResult[]
	levelAwarded: number | null
	whyNotNextLevel: string | null
	capApplied: string | null
	markSchemeId: string | null
}

function mcqRowToGradingResult(row: McqTableRow): GradingResult {
	return {
		question_id: row.questionId,
		question_text: row.questionText ?? "",
		question_number: row.questionNumber,
		student_answer: row.studentAnswer ?? "",
		awarded_score: row.awardedScore ?? 0,
		max_score: row.maxScore,
		llm_reasoning: row.llmReasoning ?? "",
		feedback_summary: row.feedbackSummary ?? "",
		marking_method: row.markingMethod,
		level_awarded: row.levelAwarded ?? undefined,
		what_went_well: row.whatWentWell,
		even_better_if: row.evenBetterIf,
		multiple_choice_options: row.options,
		correct_option_labels: row.correctLabels,
		mark_points_results: row.markPointsResults,
	}
}

function questionAnswerToGradingResult(
	node: PmNode,
	attrs: QuestionAnswerAttrs,
): GradingResult {
	return {
		question_id: attrs.questionId ?? "",
		question_text: attrs.questionText ?? "",
		question_number: attrs.questionNumber ?? "",
		student_answer: node.textContent,
		awarded_score: attrs.awardedScore ?? 0,
		max_score: attrs.maxScore ?? 0,
		llm_reasoning: attrs.llmReasoning ?? "",
		feedback_summary: attrs.feedbackSummary ?? "",
		marking_method: attrs.markingMethod,
		level_awarded: attrs.levelAwarded ?? undefined,
		what_went_well: attrs.whatWentWell,
		even_better_if: attrs.evenBetterIf,
		mark_points_results: attrs.markPointsResults,
	}
}

// ─── Teacher overrides ───────────────────────────────────────────────────────

/**
 * Per-question teacher override extracted from the doc — same shape the
 * `TeacherOverride` table holds. The projection Lambda emits one row per
 * question that carries a non-null `teacherOverride` or
 * `teacherFeedbackOverride`; questions without either are skipped.
 */
export type DerivedTeacherOverride = {
	question_id: string
	score_override: number | null
	reason: string | null
	feedback_override: string | null
	set_by: string | null
	set_at: string | null
}

export function deriveTeacherOverridesFromDoc(
	doc: PmNode,
): DerivedTeacherOverride[] {
	const out: DerivedTeacherOverride[] = []

	doc.descendants((node) => {
		if (node.type.name === "mcqTable") {
			const rows = (node.attrs.results as McqTableRow[] | undefined) ?? []
			for (const row of rows) {
				const o = (
					row as unknown as {
						teacherOverride: TeacherOverrideShape | null
						teacherFeedbackOverride: string | null
					}
				).teacherOverride
				const f = (
					row as unknown as {
						teacherFeedbackOverride: string | null
					}
				).teacherFeedbackOverride
				if (o == null && f == null) continue
				out.push({
					question_id: row.questionId,
					score_override: o?.score ?? null,
					reason: o?.reason ?? null,
					feedback_override: f ?? null,
					set_by: o?.setBy ?? null,
					set_at: o?.setAt ?? null,
				})
			}
			return false
		}

		if (node.type.name === "questionAnswer") {
			const attrs = node.attrs as QuestionAnswerAttrs & {
				teacherOverride: TeacherOverrideShape | null
				teacherFeedbackOverride: string | null
			}
			if (attrs.questionId == null) return false
			if (
				attrs.teacherOverride == null &&
				attrs.teacherFeedbackOverride == null
			)
				return false
			out.push({
				question_id: attrs.questionId,
				score_override: attrs.teacherOverride?.score ?? null,
				reason: attrs.teacherOverride?.reason ?? null,
				feedback_override: attrs.teacherFeedbackOverride ?? null,
				set_by: attrs.teacherOverride?.setBy ?? null,
				set_at: attrs.teacherOverride?.setAt ?? null,
			})
			return false
		}
	})

	return out
}

type TeacherOverrideShape = {
	score: number | null
	reason: string | null
	feedback: string | null
	setBy: string | null
	setAt: string | null
}

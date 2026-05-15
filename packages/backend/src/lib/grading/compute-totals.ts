import type { SectionChoiceKind } from "@mcp-gcse/db"
import { resolveSectionResults, sectionExpectedMax } from "@mcp-gcse/shared"

/**
 * Pure choice-aware paper-totals helper for the grading lambda.
 *
 * Lifted out of student-paper-grade.ts so the math is testable without
 * spinning up Hocuspocus / Gemini / Prisma. The lambda is the adapter:
 * it shaves its ExamPaperWithSections Prisma payload down to the narrow
 * inputs this module needs, then forwards any returned anomalies to the
 * structured logger.
 *
 * ── Behavior ─────────────────────────────────────────────────────────
 *
 * For each section:
 *   - Group its grading results. For each, derive has_answer from the
 *     OCR answer map (a stub for an empty answer ranks below any real
 *     attempt).
 *   - Apply resolveSectionResults to pick the questions that count
 *     toward the awarded score (kind=all → everything;
 *     kind=any_n_of(n) → top-n by has_answer, awarded, max).
 *   - Use sectionExpectedMax for the section's contribution to the
 *     paper denominator so a student who answered 0/N still preserves
 *     the right "/ X" total.
 *
 * Orphan results (a graded question_id with no section link, rare —
 * survives a paper edit) fall back to naive sum so no mark is silently
 * dropped, and surface as a `kind="orphan_results"` anomaly.
 *
 * ── Anomalies ────────────────────────────────────────────────────────
 *
 * Returned as data — the caller decides how to surface them. Two kinds:
 *
 *   - "section_total_drift": persisted section.total_marks ≠
 *     sectionExpectedMax. Typical cause is the bundle extractor missed
 *     an any_n_of choice rule (e.g. Pearson English Lang P1 Sec B
 *     printed "40 marks" with two 40-mark alternatives but came out as
 *     choice_kind=all → naive 80). Surfacing it during grading lets a
 *     teacher fix the paper before grading more submissions.
 *
 *   - "orphan_results": grading results that don't link to any section
 *     of the loaded paper. Indicates a paper edit dropped questions
 *     out of the structure between OCR and grading.
 */

export type ComputeTotalsResult = {
	question_id: string
	awarded_score: number
	max_score: number
}

export type ComputeTotalsSection = {
	id: string
	title: string
	total_marks: number
	choice_kind: SectionChoiceKind
	choice_n: number | null
	questions: Array<{ id: string; points: number | null }>
}

export type ComputeTotalsInput = {
	gradingResults: ComputeTotalsResult[]
	sections: ComputeTotalsSection[]
	/** question_id → student answer text. Empty / whitespace = has_answer=false. */
	answerMap: Map<string, string>
}

export type ComputeTotalsAnomaly =
	| {
			kind: "section_total_drift"
			section_id: string
			section_title: string
			persisted_total: number
			choice_aware_max: number
			choice_kind: SectionChoiceKind
			choice_n: number | null
			question_count: number
	  }
	| {
			kind: "orphan_results"
			orphan_count: number
			orphans_awarded: number
			orphans_max: number
			sample_question_ids: string[]
	  }

export type ComputeTotalsOutput = {
	totalAwarded: number
	totalMax: number
	anomalies: ComputeTotalsAnomaly[]
}

export function computeTotals({
	gradingResults,
	sections,
	answerMap,
}: ComputeTotalsInput): ComputeTotalsOutput {
	// question_id → section index
	const sectionIndexByQuestion = new Map<string, number>()
	sections.forEach((section, idx) => {
		for (const q of section.questions) {
			sectionIndexByQuestion.set(q.id, idx)
		}
	})

	// Group results by section + collect orphans.
	const resultsBySection = new Map<number, ComputeTotalsResult[]>()
	const orphans: ComputeTotalsResult[] = []
	for (const r of gradingResults) {
		const idx = sectionIndexByQuestion.get(r.question_id)
		if (idx === undefined) {
			orphans.push(r)
			continue
		}
		const bucket = resultsBySection.get(idx) ?? []
		bucket.push(r)
		resultsBySection.set(idx, bucket)
	}

	const anomalies: ComputeTotalsAnomaly[] = []
	let totalAwarded = 0
	let totalMax = 0

	sections.forEach((section, idx) => {
		const sectionResults = resultsBySection.get(idx) ?? []
		const annotated = sectionResults.map((r) => ({
			...r,
			has_answer: (answerMap.get(r.question_id) ?? "").trim().length > 0,
		}))
		const { included } = resolveSectionResults(section, annotated)
		const sectionAwarded = included.reduce((s, r) => s + r.awarded_score, 0)

		const points = section.questions.map((q) => q.points ?? 0)
		const sectionMax = sectionExpectedMax(section, points)

		totalAwarded += sectionAwarded
		totalMax += sectionMax

		if (section.total_marks !== sectionMax) {
			anomalies.push({
				kind: "section_total_drift",
				section_id: section.id,
				section_title: section.title,
				persisted_total: section.total_marks,
				choice_aware_max: sectionMax,
				choice_kind: section.choice_kind,
				choice_n: section.choice_n,
				question_count: section.questions.length,
			})
		}
	})

	if (orphans.length > 0) {
		const orphansAwarded = orphans.reduce((s, r) => s + r.awarded_score, 0)
		const orphansMax = orphans.reduce((s, r) => s + r.max_score, 0)
		anomalies.push({
			kind: "orphan_results",
			orphan_count: orphans.length,
			orphans_awarded: orphansAwarded,
			orphans_max: orphansMax,
			sample_question_ids: orphans.slice(0, 5).map((r) => r.question_id),
		})
		totalAwarded += orphansAwarded
		totalMax += orphansMax
	}

	return { totalAwarded, totalMax, anomalies }
}

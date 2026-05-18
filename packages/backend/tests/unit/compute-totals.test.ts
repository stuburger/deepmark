import { describe, expect, it } from "vitest"
import {
	type ComputeTotalsSection,
	computeTotals,
} from "../../src/lib/grading/compute-totals"

// ── Fixture helpers ──────────────────────────────────────────────────────────

function r(question_id: string, awarded: number, max: number) {
	return { question_id, awarded_score: awarded, max_score: max }
}

function allSection(
	id: string,
	title: string,
	questions: ReadonlyArray<{ id: string; points: number }>,
): ComputeTotalsSection {
	return {
		id,
		title,
		total_marks: questions.reduce((s, q) => s + q.points, 0),
		choice_kind: "all",
		choice_n: null,
		questions,
	}
}

function anyNofSection(
	id: string,
	title: string,
	n: number,
	questions: ReadonlyArray<{ id: string; points: number }>,
	overrides: { total_marks?: number } = {},
): ComputeTotalsSection {
	const inferredMax = n * Math.max(0, ...questions.map((q) => q.points))
	return {
		id,
		title,
		total_marks: overrides.total_marks ?? inferredMax,
		choice_kind: "any_n_of",
		choice_n: n,
		questions,
	}
}

function answerMap(entries: Record<string, string>): Map<string, string> {
	return new Map(Object.entries(entries))
}

// ── Pure math ────────────────────────────────────────────────────────────────

describe("computeTotals — kind=all", () => {
	it("Edexcel English Lang P1 Sec A only: 1+2+4+12 = 19 / 24", () => {
		const sections = [
			allSection("sec-a", "SECTION A", [
				{ id: "q1", points: 1 },
				{ id: "q2", points: 2 },
				{ id: "q3", points: 6 },
				{ id: "q4", points: 15 },
			]),
		]
		const out = computeTotals({
			gradingResults: [
				r("q1", 1, 1),
				r("q2", 2, 2),
				r("q3", 4, 6),
				r("q4", 12, 15),
			],
			sections,
			answerMap: answerMap({ q1: "a", q2: "b", q3: "c", q4: "d" }),
		})
		expect(out.totalAwarded).toBe(19)
		expect(out.totalMax).toBe(24)
		expect(out.anomalies).toEqual([])
	})

	it("handles a paper with no graded results yet (denominator preserved)", () => {
		const sections = [
			allSection("sec-a", "SECTION A", [{ id: "q1", points: 10 }]),
		]
		const out = computeTotals({
			gradingResults: [],
			sections,
			answerMap: new Map(),
		})
		expect(out.totalAwarded).toBe(0)
		expect(out.totalMax).toBe(10)
	})
})

describe("computeTotals — kind=any_n_of", () => {
	it("picks the answered alternative (Q6 chosen, Q5 stub excluded)", () => {
		const sections = [
			anyNofSection("sec-b", "SECTION B", 1, [
				{ id: "q5", points: 40 },
				{ id: "q6", points: 40 },
			]),
		]
		const out = computeTotals({
			gradingResults: [r("q5", 0, 40), r("q6", 28, 40)],
			sections,
			answerMap: answerMap({ q5: "", q6: "I wrote a story about..." }),
		})
		expect(out.totalAwarded).toBe(28)
		expect(out.totalMax).toBe(40) // 1 × max(40, 40) = 40, NOT 80
		expect(out.anomalies).toEqual([])
	})

	it("credits the better when both attempted (Pearson policy)", () => {
		const sections = [
			anyNofSection("sec-b", "SECTION B", 1, [
				{ id: "q5", points: 40 },
				{ id: "q6", points: 40 },
			]),
		]
		const out = computeTotals({
			gradingResults: [r("q5", 35, 40), r("q6", 22, 40)],
			sections,
			answerMap: answerMap({ q5: "Full attempt under Q5", q6: "Half attempt" }),
		})
		expect(out.totalAwarded).toBe(35)
		expect(out.totalMax).toBe(40)
	})

	it("preserves denominator when neither alternative was answered", () => {
		const sections = [
			anyNofSection("sec-b", "SECTION B", 1, [
				{ id: "q5", points: 40 },
				{ id: "q6", points: 40 },
			]),
		]
		const out = computeTotals({
			gradingResults: [r("q5", 0, 40), r("q6", 0, 40)],
			sections,
			answerMap: answerMap({ q5: "", q6: "   " }),
		})
		expect(out.totalAwarded).toBe(0)
		expect(out.totalMax).toBe(40) // student gets / 40 not / 0
	})

	it("any_n_of(2): top 2 of 3 alternatives summed", () => {
		const sections = [
			anyNofSection("essay", "ESSAY", 2, [
				{ id: "a", points: 20 },
				{ id: "b", points: 20 },
				{ id: "c", points: 20 },
			]),
		]
		const out = computeTotals({
			gradingResults: [r("a", 10, 20), r("b", 18, 20), r("c", 15, 20)],
			sections,
			answerMap: answerMap({ a: "x", b: "x", c: "x" }),
		})
		expect(out.totalAwarded).toBe(33) // b(18) + c(15)
		expect(out.totalMax).toBe(40) // 2 × 20
	})
})

// ── Full-paper reconciliation ────────────────────────────────────────────────

describe("computeTotals — Edexcel English Lang P1 full paper", () => {
	const sections: ComputeTotalsSection[] = [
		allSection("sec-a", "SECTION A", [
			{ id: "q1", points: 1 },
			{ id: "q2", points: 2 },
			{ id: "q3", points: 6 },
			{ id: "q4", points: 15 },
		]),
		anyNofSection("sec-b", "SECTION B", 1, [
			{ id: "q5", points: 40 },
			{ id: "q6", points: 40 },
		]),
	]

	it("Q6-chosen student: 19 + 28 = 47 / 64", () => {
		const out = computeTotals({
			gradingResults: [
				r("q1", 1, 1),
				r("q2", 2, 2),
				r("q3", 4, 6),
				r("q4", 12, 15),
				r("q5", 0, 40),
				r("q6", 28, 40),
			],
			sections,
			answerMap: answerMap({
				q1: "a",
				q2: "b",
				q3: "c",
				q4: "d",
				q5: "",
				q6: "Chose this one",
			}),
		})
		expect(out.totalAwarded).toBe(47)
		expect(out.totalMax).toBe(64)
		expect(out.anomalies).toEqual([])
	})
})

// ── Anomalies ────────────────────────────────────────────────────────────────

describe("computeTotals — anomalies", () => {
	it("emits section_total_drift when persisted total ≠ choice-aware max", () => {
		// Legacy data: Sec B persisted as choice=all + total_marks=80 (naive
		// sum of two 40-mark alternatives). Real shape is any_n_of(1) → 40.
		// We model this as a row whose choice rule is correct but whose
		// total_marks is stale (e.g. linker default ran before the choice
		// fix landed).
		const sections: ComputeTotalsSection[] = [
			{
				id: "sec-b",
				title: "SECTION B",
				total_marks: 80, // STALE — should be 40
				choice_kind: "any_n_of",
				choice_n: 1,
				questions: [
					{ id: "q5", points: 40 },
					{ id: "q6", points: 40 },
				],
			},
		]
		const out = computeTotals({
			gradingResults: [r("q5", 0, 40), r("q6", 28, 40)],
			sections,
			answerMap: answerMap({ q5: "", q6: "x" }),
		})
		expect(out.anomalies).toHaveLength(1)
		expect(out.anomalies[0]).toMatchObject({
			kind: "section_total_drift",
			section_id: "sec-b",
			persisted_total: 80,
			choice_aware_max: 40,
		})
		// Totals are computed from the choice-aware max, not the stale row.
		expect(out.totalMax).toBe(40)
	})

	it("does not emit section_total_drift when persisted total matches", () => {
		const sections = [
			anyNofSection("sec-b", "SECTION B", 1, [
				{ id: "q5", points: 40 },
				{ id: "q6", points: 40 },
			]), // total_marks defaults to 40 — matches.
		]
		const out = computeTotals({
			gradingResults: [r("q5", 0, 40), r("q6", 28, 40)],
			sections,
			answerMap: answerMap({ q5: "", q6: "x" }),
		})
		expect(out.anomalies).toEqual([])
	})

	it("emits orphan_results for a graded question that's not in any section", () => {
		// Paper edit removed Q7 between OCR and grading.
		const sections = [
			allSection("sec-a", "SECTION A", [{ id: "q1", points: 10 }]),
		]
		const out = computeTotals({
			gradingResults: [r("q1", 8, 10), r("q7-orphan", 5, 5)],
			sections,
			answerMap: answerMap({ q1: "x", "q7-orphan": "y" }),
		})
		const orphan = out.anomalies.find((a) => a.kind === "orphan_results")
		expect(orphan).toMatchObject({
			kind: "orphan_results",
			orphan_count: 1,
			orphans_awarded: 5,
			orphans_max: 5,
			sample_question_ids: ["q7-orphan"],
		})
		// Orphan marks still counted so nothing is silently dropped.
		expect(out.totalAwarded).toBe(13)
		expect(out.totalMax).toBe(15)
	})

	it("orphan sample is capped at 5 IDs", () => {
		const orphanResults = Array.from({ length: 12 }, (_, i) =>
			r(`orphan-${i}`, 1, 1),
		)
		const orphanAnswers: Record<string, string> = {}
		for (const o of orphanResults) orphanAnswers[o.question_id] = "x"

		const out = computeTotals({
			gradingResults: orphanResults,
			sections: [],
			answerMap: answerMap(orphanAnswers),
		})
		const orphan = out.anomalies.find((a) => a.kind === "orphan_results")
		expect(orphan?.kind).toBe("orphan_results")
		if (orphan?.kind === "orphan_results") {
			expect(orphan.orphan_count).toBe(12)
			expect(orphan.sample_question_ids).toHaveLength(5)
		}
	})
})

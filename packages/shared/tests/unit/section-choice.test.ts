import { describe, expect, it } from "vitest"
import {
	type GradedAlternativeLike,
	type SectionChoiceLike,
	resolveSectionResults,
	sectionExpectedMax,
} from "../../src/section-choice"

// ─── Test fixture helpers ────────────────────────────────────────────────────

const ALL: SectionChoiceLike = { choice_kind: "all", choice_n: null }
const ONE_OF: SectionChoiceLike = { choice_kind: "any_n_of", choice_n: 1 }
const TWO_OF: SectionChoiceLike = { choice_kind: "any_n_of", choice_n: 2 }

function r(
	id: string,
	awarded: number,
	max: number,
	hasAnswer = true,
): GradedAlternativeLike {
	return {
		question_id: id,
		awarded_score: awarded,
		max_score: max,
		has_answer: hasAnswer,
	}
}

// ─── resolveSectionResults ──────────────────────────────────────────────────

describe("resolveSectionResults", () => {
	describe("kind=all", () => {
		it("includes every result, excludes none", () => {
			const out = resolveSectionResults(ALL, [r("a", 5, 10), r("b", 3, 10)])
			expect(out.included.map((x) => x.question_id)).toEqual(["a", "b"])
			expect(out.excluded).toEqual([])
		})

		it("treats kind=any_n_of with null n as 'all' (defensive)", () => {
			// Schema-level invariant says any_n_of always carries n; we still
			// fall back to all-results rather than throwing because a bad row
			// shouldn't blow up paper-totals rendering.
			const out = resolveSectionResults(
				{ choice_kind: "any_n_of", choice_n: null },
				[r("a", 5, 10), r("b", 3, 10)],
			)
			expect(out.included).toHaveLength(2)
			expect(out.excluded).toEqual([])
		})

		it("returns empty included/excluded when no results", () => {
			const out = resolveSectionResults(ALL, [])
			expect(out.included).toEqual([])
			expect(out.excluded).toEqual([])
		})
	})

	describe("kind=any_n_of", () => {
		it("picks the higher-scoring alternative when both answered", () => {
			// English Lang P1 Sec B: student wrote under both Q5 and Q6. Pearson
			// credits the better — Q6 here (28 > 15).
			const out = resolveSectionResults(ONE_OF, [
				r("q5", 15, 40),
				r("q6", 28, 40),
			])
			expect(out.included.map((x) => x.question_id)).toEqual(["q6"])
			expect(out.excluded.map((x) => x.question_id)).toEqual(["q5"])
		})

		it("picks the only answered alternative, leaves the empty one out", () => {
			// Common case: student answered Q6 only. The Q5 stub MarkingResult
			// has has_answer=false, so it never wins the ranking even though
			// its awarded_score is the same (0 = 0).
			const out = resolveSectionResults(ONE_OF, [
				r("q5", 0, 40, false),
				r("q6", 28, 40, true),
			])
			expect(out.included.map((x) => x.question_id)).toEqual(["q6"])
			expect(out.excluded.map((x) => x.question_id)).toEqual(["q5"])
		})

		it("falls back to ranking on max_score when both unanswered (preserves denominator)", () => {
			// Student skipped Section B entirely. Both stubs have has_answer=false
			// and awarded=0. We still pick one so the section keeps contributing
			// its expected max to the paper denominator — otherwise the paper
			// total looks wrong when nothing's answered.
			const out = resolveSectionResults(ONE_OF, [
				r("q5", 0, 40, false),
				r("q6", 0, 40, false),
			])
			expect(out.included).toHaveLength(1)
			expect(out.excluded).toHaveLength(1)
		})

		it("picks top 2 of 3 alternatives, ranked", () => {
			const out = resolveSectionResults(TWO_OF, [
				r("a", 5, 10),
				r("b", 9, 10),
				r("c", 7, 10),
			])
			expect(out.included.map((x) => x.question_id)).toEqual(["b", "c"])
			expect(out.excluded.map((x) => x.question_id)).toEqual(["a"])
		})

		it("tiebreaks equal awarded by max_score (prefers higher-stakes question)", () => {
			// Both alternatives scored 10/?, one is out of 40 and one is out of
			// 30 — prefer the /40 result. Rare in practice (boards normally
			// keep alternatives equal-weighted) but stable behavior is better
			// than coin-flip.
			const out = resolveSectionResults(ONE_OF, [
				r("low-stakes", 10, 30),
				r("high-stakes", 10, 40),
			])
			expect(out.included.map((x) => x.question_id)).toEqual(["high-stakes"])
		})

		it("does not mutate the input array", () => {
			const input = [r("a", 5, 10), r("b", 9, 10), r("c", 7, 10)]
			const before = input.map((x) => x.question_id)
			resolveSectionResults(TWO_OF, input)
			expect(input.map((x) => x.question_id)).toEqual(before)
		})

		it("returns empty included/excluded when no results", () => {
			const out = resolveSectionResults(ONE_OF, [])
			expect(out.included).toEqual([])
			expect(out.excluded).toEqual([])
		})
	})
})

// ─── sectionExpectedMax ─────────────────────────────────────────────────────

describe("sectionExpectedMax", () => {
	it("sums every question for kind=all", () => {
		// Edexcel English Lang P1 Sec A: 1 + 2 + 6 + 15 = 24.
		expect(sectionExpectedMax(ALL, [1, 2, 6, 15])).toBe(24)
	})

	it("returns n × max for kind=any_n_of (English Lang P1 Sec B case)", () => {
		// Two 40-mark alternatives, choose 1 → 40, not 80.
		expect(sectionExpectedMax(ONE_OF, [40, 40])).toBe(40)
	})

	it("returns n × max when alternatives are unequally weighted", () => {
		// Picks the higher per-alternative ceiling so the denominator covers
		// the best-case student. Documented limitation in the module comment.
		expect(sectionExpectedMax(ONE_OF, [30, 40])).toBe(40)
	})

	it("multiplies by n for any_n_of(n>1)", () => {
		// "Choose 2 of 3, each worth 20" → 40.
		expect(sectionExpectedMax(TWO_OF, [20, 20, 20])).toBe(40)
	})

	it("returns 0 when there are no questions", () => {
		expect(sectionExpectedMax(ALL, [])).toBe(0)
		expect(sectionExpectedMax(ONE_OF, [])).toBe(0)
	})

	it("treats any_n_of with null n as 'all' (defensive)", () => {
		expect(
			sectionExpectedMax({ choice_kind: "any_n_of", choice_n: null }, [10, 20]),
		).toBe(30)
	})
})

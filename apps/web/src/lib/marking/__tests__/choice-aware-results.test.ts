import { describe, expect, it } from "vitest"
import {
	type ChoiceAwareSection,
	type GradingResultLike,
	partitionResultsByChoice,
} from "../choice-aware-results"

// ─── Fixture helpers ─────────────────────────────────────────────────────────

function r(
	id: string,
	awarded: number,
	max: number,
	answer = "x",
): GradingResultLike {
	return {
		question_id: id,
		awarded_score: awarded,
		max_score: max,
		student_answer: answer,
	}
}

const empty = "" // empty student_answer → has_answer=false in the ranker

const ALL: ChoiceAwareSection = {
	choice_kind: "all",
	choice_n: null,
	question_ids: [],
}

const ONE_OF: ChoiceAwareSection = {
	choice_kind: "any_n_of",
	choice_n: 1,
	question_ids: [],
}

const TWO_OF: ChoiceAwareSection = {
	choice_kind: "any_n_of",
	choice_n: 2,
	question_ids: [],
}

// ─── kind=all ────────────────────────────────────────────────────────────────

describe("partitionResultsByChoice — kind=all", () => {
	it("includes every result, sums awarded", () => {
		// Edexcel English Lang P1 Sec A: 4 questions, all answered.
		const results = [
			r("q1", 1, 1),
			r("q2", 2, 2),
			r("q3", 4, 6),
			r("q4", 12, 15),
		]
		const out = partitionResultsByChoice({
			sections: [{ ...ALL, question_ids: ["q1", "q2", "q3", "q4"] }],
			results,
		})
		expect(out.totalAwarded).toBe(19)
		expect(out.results.every((x) => x.included_in_total)).toBe(true)
		// all-section: every sectioned question id participates in
		// includedIds since resolveSectionResults returns all results as
		// included.
		expect(out.includedIds).toEqual(new Set(["q1", "q2", "q3", "q4"]))
	})

	it("handles empty results without crashing", () => {
		const out = partitionResultsByChoice({
			sections: [{ ...ALL, question_ids: ["q1", "q2"] }],
			results: [],
		})
		expect(out.totalAwarded).toBe(0)
		expect(out.results).toEqual([])
		expect(out.includedIds.size).toBe(0)
	})
})

// ─── kind=any_n_of: the core unlock ──────────────────────────────────────────

describe("partitionResultsByChoice — kind=any_n_of", () => {
	it("picks the better-scoring alternative when both answered (Pearson 'credit the better')", () => {
		// Sec B: Q5 28/40, Q6 15/40. Student tried both. Q5 wins.
		const out = partitionResultsByChoice({
			sections: [{ ...ONE_OF, question_ids: ["q5", "q6"] }],
			results: [r("q5", 28, 40), r("q6", 15, 40)],
		})
		expect(out.totalAwarded).toBe(28)
		expect(out.includedIds).toEqual(new Set(["q5"]))
		expect(
			out.results.find((x) => x.question_id === "q5")?.included_in_total,
		).toBe(true)
		expect(
			out.results.find((x) => x.question_id === "q6")?.included_in_total,
		).toBe(false)
	})

	it("picks the only answered alternative, excludes empty stubs", () => {
		// Common case: student answered Q6 only. Q5 is a stub from the
		// "no answer extracted" branch in gradeOneQuestion.
		const out = partitionResultsByChoice({
			sections: [{ ...ONE_OF, question_ids: ["q5", "q6"] }],
			results: [r("q5", 0, 40, empty), r("q6", 28, 40)],
		})
		expect(out.totalAwarded).toBe(28)
		expect(
			out.results.find((x) => x.question_id === "q6")?.included_in_total,
		).toBe(true)
		expect(
			out.results.find((x) => x.question_id === "q5")?.included_in_total,
		).toBe(false)
	})

	it("preserves the denominator when neither alternative was answered", () => {
		// Student skipped Section B entirely. Both stubs. Ranker still picks
		// one (by max_score tiebreak) so the paper denominator keeps the
		// section's expected max. totalAwarded for the section is 0.
		const out = partitionResultsByChoice({
			sections: [{ ...ONE_OF, question_ids: ["q5", "q6"] }],
			results: [r("q5", 0, 40, empty), r("q6", 0, 40, empty)],
		})
		expect(out.totalAwarded).toBe(0)
		expect(out.includedIds.size).toBe(1) // one alternative tagged included
	})

	it("any_n_of(2): top 2 of 3 alternatives counted", () => {
		const out = partitionResultsByChoice({
			sections: [{ ...TWO_OF, question_ids: ["a", "b", "c"] }],
			results: [r("a", 5, 10), r("b", 9, 10), r("c", 7, 10)],
		})
		expect(out.totalAwarded).toBe(16) // b(9) + c(7)
		expect(out.includedIds).toEqual(new Set(["b", "c"]))
	})

	it("override applied to awarded_score wins the rank", () => {
		// LLM scored Q5 28/40 and Q6 15/40, but teacher overrode Q6 to
		// 35/40. Pre-baked awarded_score puts Q6 ahead. (Override pre-bake
		// happens at the call site — this test confirms the primitive
		// respects whatever awarded_score it's handed.)
		const out = partitionResultsByChoice({
			sections: [{ ...ONE_OF, question_ids: ["q5", "q6"] }],
			results: [r("q5", 28, 40), r("q6", 35, 40)], // q6 has override pre-baked
		})
		expect(out.totalAwarded).toBe(35)
		expect(out.includedIds).toEqual(new Set(["q6"]))
	})
})

// ─── Mixed sections ──────────────────────────────────────────────────────────

describe("partitionResultsByChoice — mixed sections", () => {
	it("Edexcel English Lang P1 full paper: Sec A all + Sec B 1-of-2", () => {
		// Student answered Q1-Q4 fully + chose Q6. The Q5 stub doesn't count.
		const out = partitionResultsByChoice({
			sections: [
				{ ...ALL, question_ids: ["q1", "q2", "q3", "q4"] },
				{ ...ONE_OF, question_ids: ["q5", "q6"] },
			],
			results: [
				r("q1", 1, 1),
				r("q2", 2, 2),
				r("q3", 4, 6),
				r("q4", 12, 15),
				r("q5", 0, 40, empty),
				r("q6", 28, 40),
			],
		})
		expect(out.totalAwarded).toBe(47) // 1+2+4+12 + 28
		// Every Sec A id participates + Q6 (the chosen Sec B alternative).
		// Q5 (the stub) is the only excluded id.
		expect(out.includedIds).toEqual(new Set(["q1", "q2", "q3", "q4", "q6"]))
		expect(
			out.results.find((x) => x.question_id === "q1")?.included_in_total,
		).toBe(true)
		expect(
			out.results.find((x) => x.question_id === "q5")?.included_in_total,
		).toBe(false)
	})
})

// ─── Sectionless ("orphan") results ──────────────────────────────────────────

describe("partitionResultsByChoice — orphan results", () => {
	it("passes orphan results through as included (no marks dropped on paper edit)", () => {
		// Paper had a Q7 graded earlier; teacher deleted it from the paper
		// before regrading. The submission still carries the Q7 result.
		const out = partitionResultsByChoice({
			sections: [{ ...ALL, question_ids: ["q1", "q2"] }],
			results: [r("q1", 1, 1), r("q2", 2, 2), r("q7-orphan", 5, 5)],
		})
		expect(out.totalAwarded).toBe(8)
		expect(
			out.results.find((x) => x.question_id === "q7-orphan")?.included_in_total,
		).toBe(true)
	})
})

import { describe, expect, it } from "vitest"
import { sumPaperPoints, sumSectionPoints } from "../paper-totals"

// Tiny structural helper — these wrappers exist so a future change to
// the shared sectionExpectedMax doesn't silently break the marking-view
// denominator. The interesting cases are the choice-aware branches.

function section(
	points: ReadonlyArray<number>,
	opts: { choice_kind?: "all" | "any_n_of"; choice_n?: number | null } = {},
) {
	return {
		choice_kind: opts.choice_kind ?? "all",
		choice_n: opts.choice_n ?? null,
		exam_section_questions: points.map((p) => ({ question: { points: p } })),
	}
}

describe("sumSectionPoints", () => {
	it("sums every question for kind=all", () => {
		// Edexcel English Lang P1 Sec A: 1 + 2 + 6 + 15 = 24.
		expect(sumSectionPoints(section([1, 2, 6, 15]))).toBe(24)
	})

	it("returns n × max for kind=any_n_of (Sec B 1-of-2 × 40)", () => {
		expect(
			sumSectionPoints(
				section([40, 40], { choice_kind: "any_n_of", choice_n: 1 }),
			),
		).toBe(40)
	})

	it("handles null question points as 0", () => {
		const s = {
			choice_kind: "all" as const,
			choice_n: null,
			exam_section_questions: [
				{ question: { points: 5 } },
				{ question: { points: null } },
				{ question: { points: 3 } },
			],
		}
		expect(sumSectionPoints(s)).toBe(8)
	})

	it("returns 0 for an empty section", () => {
		expect(sumSectionPoints(section([]))).toBe(0)
	})
})

describe("sumPaperPoints", () => {
	it("Edexcel English Lang P1 reconciles to 64", () => {
		// Sec A (all): 1+2+6+15 = 24
		// Sec B (any_n_of(1)): max(40, 40) × 1 = 40
		// Total: 64, not 104.
		const sections = [
			section([1, 2, 6, 15]),
			section([40, 40], { choice_kind: "any_n_of", choice_n: 1 }),
		]
		expect(sumPaperPoints(sections)).toBe(64)
	})

	it("returns 0 for a paper with no sections", () => {
		expect(sumPaperPoints([])).toBe(0)
	})
})

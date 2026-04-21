import { describe, expect, it } from "vitest"
import {
	DEFAULT_BOUNDARIES,
	GRADES,
	type GradeBoundary,
	TIERED_SUBJECTS,
	boundariesEqual,
	computeGrade,
	getTypicalBoundaries,
	gradeBoundariesSchema,
	isTieredSubject,
} from "../../src/grade-boundaries"

const TYPICAL_HIGHER: GradeBoundary[] = [
	{ grade: "9", min_percent: 80 },
	{ grade: "8", min_percent: 70 },
	{ grade: "7", min_percent: 60 },
	{ grade: "6", min_percent: 50 },
	{ grade: "5", min_percent: 40 },
	{ grade: "4", min_percent: 30 },
	{ grade: "3", min_percent: 20 },
	{ grade: "2", min_percent: 10 },
	{ grade: "1", min_percent: 5 },
]

describe("computeGrade", () => {
	it("returns null when boundaries are unset", () => {
		expect(computeGrade(50, 100, null)).toBe(null)
		expect(computeGrade(50, 100, undefined)).toBe(null)
		expect(computeGrade(50, 100, [])).toBe(null)
	})

	it("returns the highest grade whose threshold is met", () => {
		expect(computeGrade(80, 100, TYPICAL_HIGHER)).toBe("9")
		expect(computeGrade(79, 100, TYPICAL_HIGHER)).toBe("8")
		expect(computeGrade(60, 100, TYPICAL_HIGHER)).toBe("7")
		expect(computeGrade(50, 100, TYPICAL_HIGHER)).toBe("6")
		expect(computeGrade(30, 100, TYPICAL_HIGHER)).toBe("4")
	})

	it("returns U for scores below grade 1", () => {
		expect(computeGrade(4, 100, TYPICAL_HIGHER)).toBe("U")
		expect(computeGrade(0, 100, TYPICAL_HIGHER)).toBe("U")
	})

	it("returns U when max is zero or negative", () => {
		expect(computeGrade(5, 0, TYPICAL_HIGHER)).toBe("U")
		expect(computeGrade(5, -1, TYPICAL_HIGHER)).toBe("U")
	})

	it("uses percentage, not raw marks", () => {
		expect(computeGrade(40, 50, TYPICAL_HIGHER)).toBe("9")
		expect(computeGrade(35, 50, TYPICAL_HIGHER)).toBe("8")
	})

	it("is robust to unsorted input", () => {
		const shuffled = [...TYPICAL_HIGHER].reverse()
		expect(computeGrade(80, 100, shuffled)).toBe("9")
		expect(computeGrade(4, 100, shuffled)).toBe("U")
	})

	it("grade 1 threshold is inclusive", () => {
		expect(computeGrade(5, 100, TYPICAL_HIGHER)).toBe("1")
	})
})

describe("gradeBoundariesSchema", () => {
	it("accepts a valid descending set", () => {
		expect(() => gradeBoundariesSchema.parse(TYPICAL_HIGHER)).not.toThrow()
	})

	it("rejects fewer than 9 rows", () => {
		expect(() =>
			gradeBoundariesSchema.parse(TYPICAL_HIGHER.slice(0, 8)),
		).toThrow()
	})

	it("rejects duplicate grades", () => {
		const dup = [...TYPICAL_HIGHER]
		dup[1] = { grade: "9", min_percent: 65 }
		expect(() => gradeBoundariesSchema.parse(dup)).toThrow()
	})

	it("rejects non-descending percentages", () => {
		const bad = TYPICAL_HIGHER.map((r) =>
			r.grade === "4" ? { ...r, min_percent: 75 } : r,
		)
		expect(() => gradeBoundariesSchema.parse(bad)).toThrow()
	})

	it("rejects equal adjacent percentages", () => {
		const bad = TYPICAL_HIGHER.map((r) =>
			r.grade === "7" ? { ...r, min_percent: 70 } : r,
		)
		expect(() => gradeBoundariesSchema.parse(bad)).toThrow()
	})

	it("rejects out-of-range percentages", () => {
		expect(() =>
			gradeBoundariesSchema.parse(
				TYPICAL_HIGHER.map((r) =>
					r.grade === "9" ? { ...r, min_percent: 101 } : r,
				),
			),
		).toThrow()
		expect(() =>
			gradeBoundariesSchema.parse(
				TYPICAL_HIGHER.map((r) =>
					r.grade === "1" ? { ...r, min_percent: -1 } : r,
				),
			),
		).toThrow()
	})

	it("rejects non-integer percentages", () => {
		expect(() =>
			gradeBoundariesSchema.parse(
				TYPICAL_HIGHER.map((r) =>
					r.grade === "5" ? { ...r, min_percent: 40.5 } : r,
				),
			),
		).toThrow()
	})
})

describe("DEFAULT_BOUNDARIES", () => {
	const SUBJECTS = [
		"biology",
		"chemistry",
		"physics",
		"english",
		"english_literature",
		"mathematics",
		"history",
		"geography",
		"computer_science",
		"french",
		"spanish",
		"religious_studies",
		"business",
	] as const

	it("has an entry for every subject × tier combo", () => {
		for (const subject of SUBJECTS) {
			if (TIERED_SUBJECTS.has(subject)) {
				expect(
					DEFAULT_BOUNDARIES[`${subject}:higher`],
					`missing ${subject}:higher`,
				).toBeDefined()
				expect(
					DEFAULT_BOUNDARIES[`${subject}:foundation`],
					`missing ${subject}:foundation`,
				).toBeDefined()
			} else {
				expect(
					DEFAULT_BOUNDARIES[`${subject}:none`],
					`missing ${subject}:none`,
				).toBeDefined()
			}
		}
	})

	it("every template passes schema validation", () => {
		for (const [key, rows] of Object.entries(DEFAULT_BOUNDARIES)) {
			expect(
				() => gradeBoundariesSchema.parse(rows),
				`invalid template ${key}`,
			).not.toThrow()
		}
	})
})

describe("getTypicalBoundaries", () => {
	it("returns the template for a tiered subject with a tier", () => {
		const b = getTypicalBoundaries("mathematics", "higher")
		expect(b).toBeDefined()
		expect(b?.[0].grade).toBe("9")
	})

	it("returns the template for an untiered subject with null tier", () => {
		expect(getTypicalBoundaries("english", null)).toBeDefined()
	})

	it("returns null for a tiered subject without a tier", () => {
		expect(getTypicalBoundaries("mathematics", null)).toBe(null)
	})

	it("returns null for unknown subjects", () => {
		expect(getTypicalBoundaries("latin", "higher")).toBe(null)
	})
})

describe("boundariesEqual", () => {
	it("treats null-null as equal", () => {
		expect(boundariesEqual(null, null)).toBe(true)
	})

	it("treats null and array as not equal", () => {
		expect(boundariesEqual(null, TYPICAL_HIGHER)).toBe(false)
		expect(boundariesEqual(TYPICAL_HIGHER, null)).toBe(false)
	})

	it("compares by value regardless of order", () => {
		expect(boundariesEqual(TYPICAL_HIGHER, [...TYPICAL_HIGHER].reverse())).toBe(
			true,
		)
	})

	it("detects a single-cell difference", () => {
		const shifted = TYPICAL_HIGHER.map((r) =>
			r.grade === "7" ? { ...r, min_percent: 59 } : r,
		)
		expect(boundariesEqual(TYPICAL_HIGHER, shifted)).toBe(false)
	})
})

describe("isTieredSubject + GRADES", () => {
	it("reports tiered subjects", () => {
		expect(isTieredSubject("mathematics")).toBe(true)
		expect(isTieredSubject("english")).toBe(false)
	})

	it("GRADES is 9..1 in descending order", () => {
		expect(GRADES).toEqual(["9", "8", "7", "6", "5", "4", "3", "2", "1"])
	})
})

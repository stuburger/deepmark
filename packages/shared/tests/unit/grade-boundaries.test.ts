import { describe, expect, it } from "vitest"
import {
	DEFAULT_BOUNDARIES,
	GRADES,
	type GradeBoundary,
	TIERED_SUBJECTS,
	boundariesEqual,
	computeGrade,
	convertBoundaries,
	getTypicalBoundaries,
	gradeBoundariesSchema,
	isTieredSubject,
} from "../../src/grade-boundaries"

const TYPICAL_HIGHER_PERCENT: GradeBoundary[] = [
	{ grade: "9", min_mark: 80 },
	{ grade: "8", min_mark: 70 },
	{ grade: "7", min_mark: 60 },
	{ grade: "6", min_mark: 50 },
	{ grade: "5", min_mark: 40 },
	{ grade: "4", min_mark: 30 },
	{ grade: "3", min_mark: 20 },
	{ grade: "2", min_mark: 10 },
	{ grade: "1", min_mark: 5 },
]

// Geoff's brief example (raw marks out of 100)
const GEOFF_BRIEF_RAW: GradeBoundary[] = [
	{ grade: "9", min_mark: 80 },
	{ grade: "8", min_mark: 75 },
	{ grade: "7", min_mark: 70 },
	{ grade: "6", min_mark: 65 },
	{ grade: "5", min_mark: 60 },
	{ grade: "4", min_mark: 50 },
	{ grade: "3", min_mark: 37 },
	{ grade: "2", min_mark: 23 },
	{ grade: "1", min_mark: 11 },
]

describe("computeGrade — percent mode (default)", () => {
	it("returns null when boundaries are unset", () => {
		expect(computeGrade(50, 100, null)).toBe(null)
		expect(computeGrade(50, 100, undefined)).toBe(null)
		expect(computeGrade(50, 100, [])).toBe(null)
	})

	it("returns the highest grade whose threshold is met", () => {
		expect(computeGrade(80, 100, TYPICAL_HIGHER_PERCENT)).toBe("9")
		expect(computeGrade(79, 100, TYPICAL_HIGHER_PERCENT)).toBe("8")
		expect(computeGrade(60, 100, TYPICAL_HIGHER_PERCENT)).toBe("7")
	})

	it("returns U below grade 1 or when max <= 0", () => {
		expect(computeGrade(4, 100, TYPICAL_HIGHER_PERCENT)).toBe("U")
		expect(computeGrade(5, 0, TYPICAL_HIGHER_PERCENT)).toBe("U")
	})

	it("uses percentage, not raw marks", () => {
		expect(computeGrade(40, 50, TYPICAL_HIGHER_PERCENT)).toBe("9")
	})

	it("grade 1 threshold is inclusive", () => {
		expect(computeGrade(5, 100, TYPICAL_HIGHER_PERCENT)).toBe("1")
	})
})

describe("computeGrade — raw mode (Geoff's brief example)", () => {
	it("9 ≥ 80", () => {
		expect(computeGrade(80, 100, GEOFF_BRIEF_RAW, "raw")).toBe("9")
		expect(computeGrade(100, 100, GEOFF_BRIEF_RAW, "raw")).toBe("9")
	})

	it("8 in 75–79", () => {
		expect(computeGrade(75, 100, GEOFF_BRIEF_RAW, "raw")).toBe("8")
		expect(computeGrade(79, 100, GEOFF_BRIEF_RAW, "raw")).toBe("8")
	})

	it("7 in 70–74", () => {
		expect(computeGrade(70, 100, GEOFF_BRIEF_RAW, "raw")).toBe("7")
		expect(computeGrade(74, 100, GEOFF_BRIEF_RAW, "raw")).toBe("7")
	})

	it("4 in 50–59", () => {
		expect(computeGrade(50, 100, GEOFF_BRIEF_RAW, "raw")).toBe("4")
		expect(computeGrade(59, 100, GEOFF_BRIEF_RAW, "raw")).toBe("4")
	})

	it("3 in 37–49", () => {
		expect(computeGrade(37, 100, GEOFF_BRIEF_RAW, "raw")).toBe("3")
		expect(computeGrade(49, 100, GEOFF_BRIEF_RAW, "raw")).toBe("3")
	})

	it("1 in 11–22", () => {
		expect(computeGrade(11, 100, GEOFF_BRIEF_RAW, "raw")).toBe("1")
		expect(computeGrade(22, 100, GEOFF_BRIEF_RAW, "raw")).toBe("1")
	})

	it("< 11 is U", () => {
		expect(computeGrade(10, 100, GEOFF_BRIEF_RAW, "raw")).toBe("U")
		expect(computeGrade(0, 100, GEOFF_BRIEF_RAW, "raw")).toBe("U")
	})

	it("ignores percentage — compares raw awarded directly", () => {
		// 75/300 is 25% (U in percent mode) but 75 raw = grade 8
		expect(computeGrade(75, 300, GEOFF_BRIEF_RAW, "raw")).toBe("8")
	})
})

describe("gradeBoundariesSchema", () => {
	it("accepts a valid descending set", () => {
		expect(() =>
			gradeBoundariesSchema.parse(TYPICAL_HIGHER_PERCENT),
		).not.toThrow()
		expect(() => gradeBoundariesSchema.parse(GEOFF_BRIEF_RAW)).not.toThrow()
	})

	it("rejects fewer than 9 rows", () => {
		expect(() =>
			gradeBoundariesSchema.parse(TYPICAL_HIGHER_PERCENT.slice(0, 8)),
		).toThrow()
	})

	it("rejects duplicate grades", () => {
		const dup = [...TYPICAL_HIGHER_PERCENT]
		dup[1] = { grade: "9", min_mark: 65 }
		expect(() => gradeBoundariesSchema.parse(dup)).toThrow()
	})

	it("rejects non-descending values", () => {
		const bad = TYPICAL_HIGHER_PERCENT.map((r) =>
			r.grade === "4" ? { ...r, min_mark: 75 } : r,
		)
		expect(() => gradeBoundariesSchema.parse(bad)).toThrow()
	})

	it("rejects equal adjacent values", () => {
		const bad = TYPICAL_HIGHER_PERCENT.map((r) =>
			r.grade === "7" ? { ...r, min_mark: 70 } : r,
		)
		expect(() => gradeBoundariesSchema.parse(bad)).toThrow()
	})

	it("rejects negative values", () => {
		expect(() =>
			gradeBoundariesSchema.parse(
				TYPICAL_HIGHER_PERCENT.map((r) =>
					r.grade === "1" ? { ...r, min_mark: -1 } : r,
				),
			),
		).toThrow()
	})

	it("rejects non-integer values", () => {
		expect(() =>
			gradeBoundariesSchema.parse(
				TYPICAL_HIGHER_PERCENT.map((r) =>
					r.grade === "5" ? { ...r, min_mark: 40.5 } : r,
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

	it("returns null for a tiered subject without a tier", () => {
		expect(getTypicalBoundaries("mathematics", null)).toBe(null)
	})

	it("returns the template for an untiered subject with null tier", () => {
		expect(getTypicalBoundaries("english", null)).toBeDefined()
	})
})

describe("boundariesEqual", () => {
	it("treats null-null as equal", () => {
		expect(boundariesEqual(null, null)).toBe(true)
	})

	it("compares by value regardless of order", () => {
		expect(
			boundariesEqual(
				TYPICAL_HIGHER_PERCENT,
				[...TYPICAL_HIGHER_PERCENT].reverse(),
			),
		).toBe(true)
	})

	it("detects a single-cell difference", () => {
		const shifted = TYPICAL_HIGHER_PERCENT.map((r) =>
			r.grade === "7" ? { ...r, min_mark: 59 } : r,
		)
		expect(boundariesEqual(TYPICAL_HIGHER_PERCENT, shifted)).toBe(false)
	})
})

describe("convertBoundaries", () => {
	it("is identity when fromMode === toMode", () => {
		expect(
			convertBoundaries(TYPICAL_HIGHER_PERCENT, "percent", "percent", 100),
		).toBe(TYPICAL_HIGHER_PERCENT)
	})

	it("converts percent → raw against a 50-mark paper", () => {
		const raw = convertBoundaries(TYPICAL_HIGHER_PERCENT, "percent", "raw", 50)
		expect(raw.find((r) => r.grade === "9")?.min_mark).toBe(40)
		expect(raw.find((r) => r.grade === "5")?.min_mark).toBe(20)
		expect(raw.find((r) => r.grade === "1")?.min_mark).toBe(3)
	})

	it("round-trips approximately through percent → raw → percent", () => {
		const raw = convertBoundaries(TYPICAL_HIGHER_PERCENT, "percent", "raw", 100)
		const back = convertBoundaries(raw, "raw", "percent", 100)
		expect(boundariesEqual(back, TYPICAL_HIGHER_PERCENT)).toBe(true)
	})

	it("returns input unchanged when total is zero", () => {
		expect(convertBoundaries(TYPICAL_HIGHER_PERCENT, "percent", "raw", 0)).toBe(
			TYPICAL_HIGHER_PERCENT,
		)
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

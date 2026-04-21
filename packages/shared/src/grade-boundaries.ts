import { z } from "zod"

export const GRADES = ["9", "8", "7", "6", "5", "4", "3", "2", "1"] as const
export type Grade = (typeof GRADES)[number]

export type Tier = "foundation" | "higher"

export type GradeBoundary = {
	grade: Grade
	/** Minimum percentage (integer 0–100) to achieve this grade. */
	min_percent: number
}

export const gradeBoundarySchema: z.ZodType<GradeBoundary> = z.object({
	grade: z.enum(GRADES),
	min_percent: z.number().int().min(0).max(100),
})

export const gradeBoundariesSchema = z
	.array(gradeBoundarySchema)
	.length(9)
	.refine((rows) => new Set(rows.map((r) => r.grade)).size === 9, {
		message: "Grades must be unique (one row per grade 9–1)",
	})
	.refine(
		(rows) => {
			const byGrade = new Map(rows.map((r) => [r.grade, r.min_percent]))
			for (let i = 0; i < GRADES.length - 1; i++) {
				const higher = byGrade.get(GRADES[i] as Grade)
				const lower = byGrade.get(GRADES[i + 1] as Grade)
				if (higher === undefined || lower === undefined) return false
				if (higher <= lower) return false
			}
			return true
		},
		{ message: "Percentages must strictly descend from grade 9 to grade 1" },
	)

/**
 * Computes the grade for a raw mark given a set of boundaries.
 *
 * Returns `null` when boundaries are unset — callers decide whether to show
 * the grade column. Returns `"U"` when the student scored below grade 1.
 */
export function computeGrade(
	awarded: number,
	max: number,
	boundaries: GradeBoundary[] | null | undefined,
): Grade | "U" | null {
	if (!boundaries || boundaries.length === 0) return null
	if (max <= 0) return "U"
	const pct = (awarded / max) * 100
	const sorted = [...boundaries].sort(
		(a, b) => Number(b.grade) - Number(a.grade),
	)
	for (const b of sorted) {
		if (pct >= b.min_percent) return b.grade
	}
	return "U"
}

// ─── Default "typical" templates ─────────────────────────────────────────────
// Approximations drawn from recent AQA/Edexcel/OCR GCSE boundary averages.
// These are advisory starting points — teachers should verify against their
// board's published values for the actual paper.

type TemplateKey = `${string}:${Tier | "none"}`

function boundaries(
	nine: number,
	eight: number,
	seven: number,
	six: number,
	five: number,
	four: number,
	three: number,
	two: number,
	one: number,
): GradeBoundary[] {
	return [
		{ grade: "9", min_percent: nine },
		{ grade: "8", min_percent: eight },
		{ grade: "7", min_percent: seven },
		{ grade: "6", min_percent: six },
		{ grade: "5", min_percent: five },
		{ grade: "4", min_percent: four },
		{ grade: "3", min_percent: three },
		{ grade: "2", min_percent: two },
		{ grade: "1", min_percent: one },
	]
}

export const DEFAULT_BOUNDARIES: Record<TemplateKey, GradeBoundary[]> = {
	// Tiered subjects — Higher and Foundation
	"mathematics:higher": boundaries(80, 70, 60, 48, 36, 22, 15, 10, 5),
	"mathematics:foundation": boundaries(85, 78, 70, 60, 48, 34, 22, 12, 5),
	"biology:higher": boundaries(78, 66, 54, 46, 38, 30, 22, 14, 7),
	"biology:foundation": boundaries(85, 76, 66, 55, 44, 33, 22, 12, 5),
	"chemistry:higher": boundaries(78, 66, 54, 46, 38, 30, 22, 14, 7),
	"chemistry:foundation": boundaries(85, 76, 66, 55, 44, 33, 22, 12, 5),
	"physics:higher": boundaries(78, 66, 54, 46, 38, 30, 22, 14, 7),
	"physics:foundation": boundaries(85, 76, 66, 55, 44, 33, 22, 12, 5),
	"french:higher": boundaries(78, 68, 58, 48, 38, 28, 20, 12, 5),
	"french:foundation": boundaries(85, 76, 66, 55, 44, 33, 22, 12, 5),
	"spanish:higher": boundaries(78, 68, 58, 48, 38, 28, 20, 12, 5),
	"spanish:foundation": boundaries(85, 76, 66, 55, 44, 33, 22, 12, 5),

	// Untiered subjects — one set of boundaries
	"english:none": boundaries(80, 72, 62, 52, 42, 32, 22, 14, 7),
	"english_literature:none": boundaries(80, 72, 62, 52, 42, 32, 22, 14, 7),
	"history:none": boundaries(78, 70, 62, 54, 46, 36, 26, 16, 7),
	"geography:none": boundaries(78, 70, 60, 50, 40, 32, 24, 16, 8),
	"religious_studies:none": boundaries(78, 70, 60, 50, 40, 32, 24, 16, 8),
	"business:none": boundaries(80, 72, 62, 52, 42, 32, 22, 14, 7),
	"computer_science:none": boundaries(80, 72, 62, 52, 42, 32, 22, 14, 7),
}

/** Subjects that have separate Foundation and Higher tier papers. */
export const TIERED_SUBJECTS = new Set<string>([
	"mathematics",
	"biology",
	"chemistry",
	"physics",
	"french",
	"spanish",
])

export function isTieredSubject(subject: string): boolean {
	return TIERED_SUBJECTS.has(subject)
}

/**
 * Returns typical boundaries for the given subject/tier combo, or null when
 * no template is configured. Tiered subjects require a tier; untiered subjects
 * must pass `null` for tier.
 */
export function getTypicalBoundaries(
	subject: string,
	tier: Tier | null,
): GradeBoundary[] | null {
	const key: TemplateKey = `${subject}:${tier ?? "none"}`
	return DEFAULT_BOUNDARIES[key] ?? null
}

/**
 * Compares two boundary sets by value. Used to detect whether the teacher
 * has customised the typicals (UI status badge).
 */
export function boundariesEqual(
	a: GradeBoundary[] | null | undefined,
	b: GradeBoundary[] | null | undefined,
): boolean {
	if (!a || !b) return a === b
	if (a.length !== b.length) return false
	const aByGrade = new Map(a.map((r) => [r.grade, r.min_percent]))
	for (const r of b) {
		if (aByGrade.get(r.grade) !== r.min_percent) return false
	}
	return true
}

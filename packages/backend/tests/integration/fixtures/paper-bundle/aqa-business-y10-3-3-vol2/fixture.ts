import * as path from "node:path"

/**
 * AQA GCSE Business — Year 10 Unit Assessment 3.3 (Vol 2) + matching mark scheme.
 *
 * Frozen fixture for the paper-bundle eval. Proves the central tech bet of the
 * Paper Setup wizard: a single Gemini call ingests QP + MS together and emits
 * paper metadata + sections + questions + per-question mark schemes ready to
 * persist atomically, with every question linked to its mark scheme.
 *
 * Assertions are intentionally permissive at v1 — we ratchet them tighter as
 * confidence builds. The strict checks are: metadata sanity, every question
 * carries a mark_scheme, and per-method shape invariants hold (point_based
 * has mark_points, level_of_response has levels, deterministic has
 * correct_option). Per-question values come later as a separate fixture set.
 */

export const AQA_BUSINESS_Y10_3_3_VOL2_FIXTURE = {
	name: "AQA Business — Y10 3.3 Vol 2",
	dir: __dirname,
	qpFilename: "question-paper.pdf",
	msFilename: "mark-scheme.pdf",
	expected: {
		titleContains: ["business"],
		subject: "business" as const,
		examBoardContains: "AQA",
		// The paper is a single-section structure — at minimum, the bundle must
		// always emit one section.
		minSections: 1,
		// Lower bound for question count; tightened upward when actuals stabilise.
		minQuestions: 8,
	},
} as const

export type PaperBundleFixture = typeof AQA_BUSINESS_Y10_3_3_VOL2_FIXTURE

export function fixturePath(
	fixture: PaperBundleFixture,
	filename: string,
): string {
	return path.join(fixture.dir, filename)
}

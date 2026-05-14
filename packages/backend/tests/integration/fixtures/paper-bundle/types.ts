import * as path from "node:path"

export type PaperBundleFixture = {
	name: string
	dir: string
	qpFilename: string
	msFilename: string
	stimulusFilename?: string
	expected: {
		titleContains: string[]
		subject:
			| "biology"
			| "chemistry"
			| "physics"
			| "english"
			| "english_literature"
			| "mathematics"
			| "history"
			| "geography"
			| "computer_science"
			| "french"
			| "spanish"
			| "religious_studies"
			| "business"
		examBoardContains: string
		minSections: number
		minQuestions: number
		// Only checked when the fixture supplies a stimulusFilename.
		stimulus?: {
			minTotal: number
			contentContains: string[]
		}
		// Per-section choice expectations, keyed by section title (case-insensitive
		// substring match — the section's title need only contain the key). Useful
		// for papers with "Answer ONE of the following" sub-sections.
		sectionChoices?: Array<{
			titleContains: string
			kind: "all" | "any_n_of"
			n: number | null
		}>
		// Whether the paper's printed_total_marks should reconcile against the
		// section totals, with any_n_of sections counted as n × max-alternative.
		expectedPrintedTotal?: number
	}
}

export function fixturePath(
	fixture: PaperBundleFixture,
	filename: string,
): string {
	return path.join(fixture.dir, filename)
}

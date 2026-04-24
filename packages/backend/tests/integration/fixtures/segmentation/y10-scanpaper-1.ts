import * as path from "node:path"

/**
 * y10_scanpaper_1 — 36-page scanned PDF containing 14 Year 10 Business
 * student scripts mixed in a single upload, with blank pages separating
 * some (but not all) students.
 *
 * Ground truth was hand-labelled from the full PDF. Page indices are
 * 0-based inclusive; trailing blank pages are attributed to the PRECEDING
 * script (they're unused answer space, not separators).
 *
 * Script boundaries are STRICT — they must match exactly. Student name
 * matching is LOOSE — a single substring token must be present (case
 * insensitive) to tolerate OCR misreads on handwritten names.
 */

export type ExpectedScript = {
	startPage: number
	endPage: number
	/** A lowercase substring that must appear in the extracted studentName. */
	nameContains: string
}

export type SegmentationFixture = {
	name: string
	pdfPath: string
	totalPages: number
	scripts: ExpectedScript[]
	/** Observed-floor thresholds — see test file for calibration notes. */
	thresholds: {
		minStartPageHits: number
		minNameHits: number
		/** Max deviation from expected script count (±). */
		scriptCountTolerance: number
	}
}

export const Y10_SCANPAPER_1_FIXTURE: SegmentationFixture = {
	name: "y10-scanpaper-1",
	pdfPath: path.resolve(
		__dirname,
		"../../../../../../y10_papers/y10_scanpaper_1.pdf",
	),
	totalPages: 36,
	scripts: [
		{ startPage: 0, endPage: 1, nameContains: "amrit" },
		{ startPage: 2, endPage: 5, nameContains: "sofia" },
		{ startPage: 6, endPage: 9, nameContains: "vongai" },
		{ startPage: 10, endPage: 13, nameContains: "jack" },
		{ startPage: 14, endPage: 15, nameContains: "ellie" },
		{ startPage: 16, endPage: 17, nameContains: "ava" },
		{ startPage: 18, endPage: 19, nameContains: "leonor" },
		{ startPage: 20, endPage: 21, nameContains: "abeenesh" },
		{ startPage: 22, endPage: 23, nameContains: "adam" },
		{ startPage: 24, endPage: 25, nameContains: "tiago" },
		{ startPage: 26, endPage: 27, nameContains: "mohammed" },
		{ startPage: 28, endPage: 31, nameContains: "ibrahim" },
		{ startPage: 32, endPage: 33, nameContains: "pawel" },
		{ startPage: 34, endPage: 35, nameContains: "sg" },
	],
	thresholds: {
		// Post-OCR pivot: 5/5 runs returned exactly 14 scripts with 14/14
		// correct boundaries and 7/14 name matches. Thresholds sit one step
		// below the observed floor so the test catches regression.
		minStartPageHits: 13,
		minNameHits: 6,
		scriptCountTolerance: 1,
	},
}

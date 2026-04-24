import * as path from "node:path"
import type {
	ExpectedScript,
	SegmentationFixture,
} from "./y10-scanpaper-1"

/**
 * y10_scanpapers_merged_cleaned — 58-page merged PDF containing 21 Year 10
 * Business student scripts across two source papers. Derived from
 * y10_scanpapers_merged.pdf with the duplicate scanpaper_1 pages removed.
 *
 * Pages 0-35 replicate the y10_scanpaper_1 fixture (14 students).
 * Pages 36-57 are the additional students from scanpaper_2/3/4 (7 students).
 *
 * Same labelling conventions as y10-scanpaper-1: 0-indexed inclusive ranges;
 * trailing blank pages belong to the preceding script; nameContains is a
 * loose substring match tolerant of handwriting OCR noise.
 */

export const Y10_SCANPAPERS_MERGED_FIXTURE: SegmentationFixture = {
	name: "y10-scanpapers-merged",
	pdfPath: path.resolve(
		__dirname,
		"../../../../../../y10_papers/y10_scanpapers_merged_cleaned.pdf",
	),
	totalPages: 58,
	scripts: [
		// ── scanpaper_1 section (pages 0-35) ──
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
		// ── additional students from scanpaper_2/3/4 (pages 36-57) ──
		{ startPage: 36, endPage: 39, nameContains: "say" }, // hard-to-read "Sayder"/"Sayler" — loose match
		{ startPage: 40, endPage: 43, nameContains: "zak" },
		{ startPage: 44, endPage: 47, nameContains: "kai" },
		{ startPage: 48, endPage: 49, nameContains: "faris" },
		{ startPage: 50, endPage: 53, nameContains: "rhia" },
		{ startPage: 54, endPage: 55, nameContains: "yen" }, // "Yenielle Antoine"
		{ startPage: 56, endPage: 57, nameContains: "chloe" },
	] satisfies ExpectedScript[],
	thresholds: {
		// Post-OCR pivot: 5/5 runs returned exactly 21 scripts with 21/21
		// correct boundaries and 11/21 name matches. Thresholds sit one step
		// below the observed floor so the test catches regression.
		minStartPageHits: 20,
		minNameHits: 9,
		scriptCountTolerance: 1,
	},
}

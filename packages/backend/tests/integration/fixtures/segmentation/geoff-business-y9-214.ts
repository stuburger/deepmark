import * as path from "node:path"
import type { SegmentationFixture } from "./y10-scanpaper-1"

/**
 * geoff-business-y9-214 — Geoff's 214-page AQA Year 9 Business batch.
 * Pulled from prod batch `cmoyloil0000002jp8fn0xg5r` (exam paper
 * `cmoya3byz000002jqbls97bn8`) on 2026-05-09 after segmentation failed
 * 4× over 6 hours with the identical error:
 *
 *   "LLM call 'pdf-script-segmentation' exceeded wall-clock timeout of 90000ms"
 *
 * Cloud Vision finished in ~22s on every attempt; the timeout was the
 * structured-output Gemini call. Once the LLM budget for this call site
 * was lifted off the 90s default, segmentation lands in 40–95s on this
 * input. For comparison, the GWAUGH 700-page batch on 2026-05-06
 * segmented in 15.9s — content density, not page count, is the latency
 * driver here.
 *
 * Ground truth: captured from the first successful segmentation run
 * (2026-05-09). 26 students at mostly 8-page boundaries with three
 * 10-page outliers; uniform pattern suggests the cohort all used the
 * same answer booklet template. Names are as OCR'd from handwritten
 * cover pages — some are garbled (e.g. "Bah fapi", "Algie 1574 Gorster")
 * and `nameContains` tokens were chosen accordingly. Boundaries are NOT
 * visually verified against the PDF; tighten the thresholds (or fix the
 * ground truth) once a human eyeballs the source.
 */
export const GEOFF_BUSINESS_Y9_214_FIXTURE: SegmentationFixture = {
	name: "geoff-business-y9-214",
	pdfPath: path.resolve(
		__dirname,
		"../../../../../../y10_papers/geoff-business-y9-214-page.pdf",
	),
	totalPages: 214,
	scripts: [
		{ startPage: 0, endPage: 7, nameContains: "ahmed" },
		{ startPage: 8, endPage: 15, nameContains: "aijaz" },
		{ startPage: 16, endPage: 23, nameContains: "ali" },
		{ startPage: 24, endPage: 31, nameContains: "bah" },
		{ startPage: 32, endPage: 39, nameContains: "baig" },
		{ startPage: 40, endPage: 47, nameContains: "brown" },
		{ startPage: 48, endPage: 55, nameContains: "copper" },
		{ startPage: 56, endPage: 63, nameContains: "gorster" },
		{ startPage: 64, endPage: 71, nameContains: "rhys" },
		{ startPage: 72, endPage: 79, nameContains: "hussain" },
		{ startPage: 80, endPage: 89, nameContains: "joshi" },
		{ startPage: 90, endPage: 99, nameContains: "kassi" },
		{ startPage: 100, endPage: 107, nameContains: "kinnard" },
		{ startPage: 108, endPage: 115, nameContains: "laker" },
		{ startPage: 116, endPage: 125, nameContains: "arun" },
		{ startPage: 126, endPage: 133, nameContains: "matthews" },
		{ startPage: 134, endPage: 141, nameContains: "morley" },
		{ startPage: 142, endPage: 149, nameContains: "nochad" },
		{ startPage: 150, endPage: 157, nameContains: "patel" },
		{ startPage: 158, endPage: 165, nameContains: "rana" },
		{ startPage: 166, endPage: 173, nameContains: "akmal" },
		{ startPage: 174, endPage: 181, nameContains: "shikh" },
		{ startPage: 182, endPage: 189, nameContains: "singh" },
		{ startPage: 190, endPage: 197, nameContains: "syed" },
		{ startPage: 198, endPage: 205, nameContains: "wardrock" },
		{ startPage: 206, endPage: 213, nameContains: "zawahin" },
	],
	thresholds: {
		// First successful run: 26/26 boundaries, full coverage. These
		// thresholds sit one step below the observed floor — same calibration
		// pattern as the existing y10 fixtures.
		minStartPageHits: 25,
		// Names are noisier than boundaries (handwriting OCR); start at
		// roughly half and ratchet upward as we observe the variance.
		minNameHits: 13,
		scriptCountTolerance: 1,
	},
}

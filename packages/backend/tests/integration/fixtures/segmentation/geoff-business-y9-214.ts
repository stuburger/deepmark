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
 * Cloud Vision finished in ~22s on every attempt — the timeout is the
 * structured-output Gemini call building scripts from page texts. For
 * comparison, the GWAUGH 700-page batch on 2026-05-06 segmented in
 * 15.9s. Whatever's expensive about this 214-page input is content-shaped,
 * not size-shaped — making this fixture the right reproducer to keep around.
 *
 * Ground truth: NONE YET. Segmentation has never landed for this PDF, so
 * we can't hand-label start pages or names. Once the timeout/abort-signal
 * fix lands and a real run produces output, inspect the result, hand-label
 * `scripts`, and ratchet the thresholds.
 *
 * Until then the fixture is structural-only: the test asserts that
 * segmentation completes within budget and `validateScripts` accepts the
 * output. The other (set-overlap / name-hit) assertions pass vacuously
 * with `scripts: []` and zero thresholds.
 */
export const GEOFF_BUSINESS_Y9_214_FIXTURE: SegmentationFixture = {
	name: "geoff-business-y9-214",
	pdfPath: path.resolve(
		__dirname,
		"../../../../../../y10_papers/geoff-business-y9-214-page.pdf",
	),
	totalPages: 214,
	scripts: [],
	thresholds: {
		minStartPageHits: 0,
		minNameHits: 0,
		scriptCountTolerance: 999,
	},
}

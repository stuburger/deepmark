import * as fs from "node:fs"
import { PDFDocument } from "pdf-lib"
import { beforeAll, describe, expect, it } from "vitest"
import { computeInkDensity } from "../../src/lib/scan-extraction/blank-detection"
import { extractJpegFromPdfPage } from "../../src/lib/script-ingestion/pdf-pages"
import {
	type SegmentPageInput,
	type SegmentedScript,
	segmentPdfScripts,
} from "../../src/lib/script-ingestion/segment-script"
import { GEOFF_BUSINESS_Y9_214_FIXTURE } from "./fixtures/segmentation/geoff-business-y9-214"
import { GWAUGH_700_PAGE_FIXTURE } from "./fixtures/segmentation/gwaugh-700-page"
import type { SegmentationFixture } from "./fixtures/segmentation/y10-scanpaper-1"
import { Y10_SCANPAPER_1_FIXTURE } from "./fixtures/segmentation/y10-scanpaper-1"
import { Y10_SCANPAPERS_MERGED_FIXTURE } from "./fixtures/segmentation/y10-scanpapers-merged"

/**
 * End-to-end eval for the single-call PDF segmentation pipeline.
 *
 * Loads a real scanned multi-student PDF from disk, splits it into
 * per-page JPEGs + blank flags (same logic production uses), then makes
 * ONE Gemini call that returns student script page ranges + names.
 *
 * Script boundaries are measured as SET overlap — how many known start
 * pages does the model detect? Student names are loose substring match.
 * Thresholds are observed floors per fixture, not theoretical targets.
 */

const FIXTURES: SegmentationFixture[] = [
	Y10_SCANPAPER_1_FIXTURE,
	Y10_SCANPAPERS_MERGED_FIXTURE,
	GEOFF_BUSINESS_Y9_214_FIXTURE,
	GWAUGH_700_PAGE_FIXTURE,
]

const BLANK_THRESHOLD = 0.005
// Hand-labelled small fixtures land in 15–30s. The 214-page geoff fixture
// is the deliberate slow case (currently failing at the LLM call's own 90s
// wall-clock; expected to land in 60–300s once the timeout/abort-signal
// fix ships). Set the hook ceiling above (LLM timeout + Vision + extract)
// for the largest fixture so the actual LLM error propagates as the test
// failure rather than a generic hook timeout swallowing it.
const SEGMENT_TIMEOUT_MS = 6 * 60_000

// Filter out fixtures whose PDFs aren't on disk. Some (e.g. GWAUGH 700-pager)
// are too big to commit and live in gitignored y10_papers — fine on the
// founder's machine where they're cached locally, silently skipped on a
// clean checkout / CI box rather than crashing beforeAll.
const AVAILABLE_FIXTURES = FIXTURES.filter((f) => {
	if (fs.existsSync(f.pdfPath)) return true
	console.warn(
		`[segmentation-evals] skipping fixture "${f.name}" — PDF missing at ${f.pdfPath}`,
	)
	return false
})

describe.each(AVAILABLE_FIXTURES)("pdf segmentation evals — $name", (fixture) => {
	let segmented: SegmentedScript[]

	beforeAll(async () => {
		const pdfBytes = fs.readFileSync(fixture.pdfPath)
		const pages = await extractPages(new Uint8Array(pdfBytes))
		expect(pages).toHaveLength(fixture.totalPages)

		const result = await segmentPdfScripts(pages, {
			// Simulate the Lambda budget: prod runs with `remaining ≈ 210s`
			// once extract+Vision is done. Without this stub the eval would
			// run against the 90s runner default and a slow run on the
			// 214-page fixture lands above 90s — that's a property of the
			// inputs being characterised, not a regression we want to flag.
			getRemainingTimeMs: () => 240_000,
			onSegmentationMetrics: (m) => {
				fs.writeFileSync(
					`/tmp/segmentation-metrics-${fixture.name}.json`,
					JSON.stringify(m, null, 2),
				)
			},
		})
		segmented = result.scripts
		// One-off capture for hand-labelling new fixtures. Writes to /tmp
		// (vitest swallows passing-test console.log by default).
		if (fixture.scripts.length === 0) {
			fs.writeFileSync(
				`/tmp/segmentation-capture-${fixture.name}.json`,
				JSON.stringify(
					segmented.map((s) => ({
						startPage: s.startPage,
						endPage: s.endPage,
						studentName: s.studentName,
					})),
					null,
					2,
				),
			)
		}
	}, SEGMENT_TIMEOUT_MS)

	it(`returns a plausible number of scripts (within ${fixture.thresholds.scriptCountTolerance} of ground truth)`, () => {
		const tol = fixture.thresholds.scriptCountTolerance
		expect(segmented.length).toBeGreaterThanOrEqual(fixture.scripts.length - tol)
		expect(segmented.length).toBeLessThanOrEqual(fixture.scripts.length + tol)
	})

	it("script boundaries are contiguous, non-overlapping, and cover all pages", () => {
		expect(segmented[0]?.startPage).toBe(0)
		expect(segmented[segmented.length - 1]?.endPage).toBe(
			fixture.totalPages - 1,
		)
		for (let i = 1; i < segmented.length; i++) {
			const prev = segmented[i - 1]
			const curr = segmented[i]
			expect(curr?.startPage).toBe((prev?.endPage ?? -1) + 1)
			expect(curr?.startPage).toBeLessThanOrEqual(curr?.endPage ?? -1)
		}
	})

	it(`at least ${fixture.thresholds.minStartPageHits}/${fixture.scripts.length} expected script start pages are detected (set match)`, () => {
		const expectedStarts = new Set(fixture.scripts.map((s) => s.startPage))
		const actualStarts = new Set(segmented.map((s) => s.startPage))
		const hits = [...expectedStarts].filter((s) => actualStarts.has(s)).length
		const missing = [...expectedStarts]
			.filter((s) => !actualStarts.has(s))
			.sort((a, b) => a - b)
		const extra = [...actualStarts]
			.filter((s) => !expectedStarts.has(s))
			.sort((a, b) => a - b)
		console.log(
			`\n[${fixture.name}] start-page accuracy: ${hits}/${expectedStarts.size}` +
				`\n  missing: ${missing.join(", ") || "(none)"}` +
				`\n  extra:   ${extra.join(", ") || "(none)"}\n`,
		)
		expect(hits).toBeGreaterThanOrEqual(fixture.thresholds.minStartPageHits)
	})

	it("LLM-reported confidence is in [0,1] and >0.5 for boundary-matched scripts (calibration floor)", () => {
		// Coarse regression signal: the model is meant to anchor scoring on
		// the prompt's high/medium/low cues. If it starts returning 0.2 for
		// segments we know are clean, something has gone wrong in the prompt
		// or the schema and we want to find out via the eval, not via teacher
		// reports.
		//
		// Per the workflow rule in CLAUDE.md ("tighten thresholds when the
		// model improves; never loosen"): the >0.5 floor is the entry-level
		// signal. Once the calibration histogram lands we ratchet upward by
		// per-fixture floor.
		// Collect first so the disk artifact always lands — assertions fire at
		// the end. A failed run still captures the distribution for the
		// calibration loop ("which script went low?").
		const expectedStarts = new Set(fixture.scripts.map((s) => s.startPage))
		const report: string[] = []
		const perScript: Array<{
			startPage: number
			endPage: number
			studentName: string | null
			confidence: number
			matchesExpectedStart: boolean
		}> = []
		const matchedBelowFloor: Array<{ startPage: number; confidence: number }> =
			[]
		for (const s of segmented) {
			const matched = expectedStarts.has(s.startPage)
			perScript.push({
				startPage: s.startPage,
				endPage: s.endPage,
				studentName: s.studentName,
				confidence: s.confidence,
				matchesExpectedStart: matched,
			})
			report.push(
				`  [${matched ? "✓" : "?"}] p${s.startPage}-${s.endPage} conf=${s.confidence.toFixed(2)} name="${s.studentName ?? "(none)"}"`,
			)
			if (matched && s.confidence <= 0.5) {
				matchedBelowFloor.push({
					startPage: s.startPage,
					confidence: s.confidence,
				})
			}
		}
		const avg =
			segmented.reduce((sum, s) => sum + s.confidence, 0) / segmented.length
		fs.writeFileSync(
			`/tmp/segmentation-confidence-${fixture.name}.json`,
			JSON.stringify(
				{
					fixture: fixture.name,
					avg,
					totalScripts: segmented.length,
					hasGroundTruth: fixture.scripts.length > 0,
					scripts: perScript,
				},
				null,
				2,
			),
		)
		console.log(
			`\n[${fixture.name}] confidence distribution (avg=${avg.toFixed(2)}):\n${report.join("\n")}\n`,
		)

		// Coarse regression: every score in [0,1] and matched scripts > 0.5.
		// Per CLAUDE.md "tighten thresholds when the model improves; never
		// loosen" — if the model regresses below the floor we want the eval
		// to fail loudly, not absorb the regression.
		for (const s of segmented) {
			expect(s.confidence).toBeGreaterThanOrEqual(0)
			expect(s.confidence).toBeLessThanOrEqual(1)
		}
		expect(
			matchedBelowFloor,
			`Ground-truth-matched scripts dipped below the 0.5 floor — the prompt is mis-anchoring or the model is hedging on this fixture: ${JSON.stringify(matchedBelowFloor)}`,
		).toEqual([])
	})

	it(`at least ${fixture.thresholds.minNameHits}/${fixture.scripts.length} expected students are found by name (soft quality gate)`, () => {
		// Match by startPage first, then fall back to range overlap — this lets
		// the test survive small boundary drifts without penalising name
		// accuracy. Name matching itself is a loose substring check, since
		// handwritten names OCR poorly.
		const report: string[] = []
		let hits = 0
		for (const [i, expected] of fixture.scripts.entries()) {
			const match =
				segmented.find((s) => s.startPage === expected.startPage) ??
				segmented.find(
					(s) =>
						s.startPage <= expected.startPage &&
						s.endPage >= expected.startPage,
				)
			const name = match?.studentName?.toLowerCase() ?? ""
			const matched = name.includes(expected.nameContains)
			if (matched) hits++
			report.push(
				`  [${matched ? "✓" : "✗"}] script ${i} p${expected.startPage}-${expected.endPage}: expected "${expected.nameContains}", got "${match?.studentName ?? "(unmatched range)"}"`,
			)
		}
		console.log(
			`\n[${fixture.name}] studentName quality: ${hits}/${fixture.scripts.length}\n${report.join("\n")}\n`,
		)
		expect(hits).toBeGreaterThanOrEqual(fixture.thresholds.minNameHits)
	})
})

async function extractPages(
	pdfBytes: Uint8Array,
): Promise<SegmentPageInput[]> {
	const pdfDoc = await PDFDocument.load(pdfBytes)
	const pageCount = pdfDoc.getPageCount()

	return Promise.all(
		Array.from({ length: pageCount }, async (_, i) => {
			const singlePage = await PDFDocument.create()
			const [copied] = await singlePage.copyPages(pdfDoc, [i])
			if (!copied) throw new Error(`copyPages returned nothing for page ${i}`)
			singlePage.addPage(copied)
			const singlePageBytes = await singlePage.save()

			const jpeg = await extractJpegFromPdfPage(singlePageBytes)
			if (!jpeg) return { order: i, jpegBuffer: null }

			const density = await computeInkDensity(jpeg)
			if (density < BLANK_THRESHOLD) return { order: i, jpegBuffer: null }

			return { order: i, jpegBuffer: jpeg }
		}),
	)
}

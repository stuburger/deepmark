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
]

const BLANK_THRESHOLD = 0.005
// A full segmentation run (Vision per page + one Gemini call) lands around
// 15–30s per fixture. Two minutes leaves comfortable headroom without
// masking a regression — per CLAUDE.md, integration tests shouldn't exceed
// 30s of actual work, and a tight timeout is our canary for that.
const SEGMENT_TIMEOUT_MS = 2 * 60_000

describe.each(FIXTURES)("pdf segmentation evals — $name", (fixture) => {
	let segmented: SegmentedScript[]

	beforeAll(async () => {
		const pdfBytes = fs.readFileSync(fixture.pdfPath)
		const pages = await extractPages(new Uint8Array(pdfBytes))
		expect(pages).toHaveLength(fixture.totalPages)

		const result = await segmentPdfScripts(pages)
		segmented = result.scripts
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

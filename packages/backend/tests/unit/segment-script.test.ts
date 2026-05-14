import { describe, expect, it } from "vitest"
import {
	type RawSegmentedScript,
	type SegmentedScript,
	lengthsToRanges,
	snapBlankStartPages,
	validateScripts,
} from "../../src/lib/script-ingestion/segmentation-transforms"

// These three transforms are the structural backbone of segmentation:
//  - lengthsToRanges: converts the LLM's per-script pageCount → 0-indexed ranges.
//  - snapBlankStartPages: corrects model errors that place a startPage on a
//    blank page (blanks always belong to the preceding student).
//  - validateScripts: gates the LLM output before the rest of the pipeline
//    trusts it to cover the whole PDF.
//
// The pure functions are cheap to test end-to-end; the integration eval
// (`tests/integration/segmentation-evals.test.ts`) covers the LLM's
// actual output shape.

describe("lengthsToRanges", () => {
	it("returns empty for empty input", () => {
		expect(lengthsToRanges([])).toEqual([])
	})

	it("converts a single 1-page script to [0..0]", () => {
		const out = lengthsToRanges([
			{ pageCount: 1, studentName: "A", confidence: 1 },
		])
		expect(out).toEqual([
			{ startPage: 0, endPage: 0, studentName: "A", confidence: 1 },
		])
	})

	it("derives contiguous 0-indexed ranges by cumulative sum", () => {
		const out = lengthsToRanges([
			{ pageCount: 3, studentName: "A", confidence: 1 },
			{ pageCount: 2, studentName: "B", confidence: 1 },
			{ pageCount: 4, studentName: "C", confidence: 1 },
		])
		expect(out).toEqual([
			{ startPage: 0, endPage: 2, studentName: "A", confidence: 1 },
			{ startPage: 3, endPage: 4, studentName: "B", confidence: 1 },
			{ startPage: 5, endPage: 8, studentName: "C", confidence: 1 },
		])
	})

	it("preserves null studentName", () => {
		const out = lengthsToRanges([
			{ pageCount: 5, studentName: null, confidence: 1 },
		])
		expect(out[0]?.studentName).toBeNull()
	})

	it("preserves per-script confidence through the cumulative-sum mapping", () => {
		const out = lengthsToRanges([
			{ pageCount: 3, studentName: "A", confidence: 0.95 },
			{ pageCount: 2, studentName: "B", confidence: 0.4 },
		])
		expect(out.map((s) => s.confidence)).toEqual([0.95, 0.4])
	})
})

describe("validateScripts", () => {
	it("rejects an empty list with 'no scripts returned'", () => {
		const r = validateScripts([], 10)
		expect(r).toEqual({ ok: false, error: "no scripts returned" })
	})

	it("accepts a single script covering exactly all pages", () => {
		const r = validateScripts(
			[{ startPage: 0, endPage: 9, studentName: "A", confidence: 1 }],
			10,
		)
		expect(r).toEqual({ ok: true })
	})

	it("accepts a multi-script list whose last endPage = totalPages-1", () => {
		const r = validateScripts(
			[
				{ startPage: 0, endPage: 4, studentName: "A", confidence: 1 },
				{ startPage: 5, endPage: 9, studentName: "B", confidence: 1 },
			],
			10,
		)
		expect(r).toEqual({ ok: true })
	})

	it("rejects under-coverage with the actual page count in the message", () => {
		const r = validateScripts(
			[{ startPage: 0, endPage: 7, studentName: "A", confidence: 1 }],
			10,
		)
		expect(r.ok).toBe(false)
		if (r.ok) return
		expect(r.error).toBe("scripts cover 8 pages but PDF has 10")
	})

	it("rejects over-coverage with the same coverage-mismatch shape", () => {
		const r = validateScripts(
			[{ startPage: 0, endPage: 11, studentName: "A", confidence: 1 }],
			10,
		)
		expect(r.ok).toBe(false)
		if (r.ok) return
		expect(r.error).toBe("scripts cover 12 pages but PDF has 10")
	})
})

describe("snapBlankStartPages", () => {
	const blanks = (...indices: number[]) => new Set(indices)

	it("returns the input unchanged when there are no blanks at script starts", () => {
		const scripts: SegmentedScript[] = [
			{ startPage: 0, endPage: 4, studentName: "A", confidence: 1 },
			{ startPage: 5, endPage: 9, studentName: "B", confidence: 1 },
		]
		expect(snapBlankStartPages(scripts, blanks(), 10)).toEqual(scripts)
	})

	it("walks a startPage forward past blanks and absorbs them into the previous script's endPage", () => {
		// Without snapping: A=[0..4], B=[5..9]. Page 5 is blank; B's startPage
		// walks forward to 6, and A's endPage extends to 5 to absorb it.
		const scripts: SegmentedScript[] = [
			{ startPage: 0, endPage: 4, studentName: "A", confidence: 1 },
			{ startPage: 5, endPage: 9, studentName: "B", confidence: 1 },
		]
		expect(snapBlankStartPages(scripts, blanks(5), 10)).toEqual([
			{ startPage: 0, endPage: 5, studentName: "A", confidence: 1 },
			{ startPage: 6, endPage: 9, studentName: "B", confidence: 1 },
		])
	})

	it("walks past multiple consecutive blanks", () => {
		const scripts: SegmentedScript[] = [
			{ startPage: 0, endPage: 1, studentName: "A", confidence: 1 },
			{ startPage: 2, endPage: 9, studentName: "B", confidence: 1 },
		]
		// Pages 2-4 blank → B walks to 5; A absorbs 2..4 in its endPage.
		expect(snapBlankStartPages(scripts, blanks(2, 3, 4), 10)).toEqual([
			{ startPage: 0, endPage: 4, studentName: "A", confidence: 1 },
			{ startPage: 5, endPage: 9, studentName: "B", confidence: 1 },
		])
	})

	it("drops a script whose snapped start collides with the previous script's snapped start", () => {
		// A=[0..1], B=[2..3] (both blanks), C=[4..9]. B walks past 2,3 → 4,
		// where C also starts. B (the earlier index) keeps the slot,
		// inheriting C's content range; C is dropped. The student-name
		// mislabelling that follows is the function's documented behaviour
		// — fixing it lives in the segmentation prompt, not here.
		const scripts: SegmentedScript[] = [
			{ startPage: 0, endPage: 1, studentName: "A", confidence: 1 },
			{ startPage: 2, endPage: 3, studentName: "B", confidence: 1 },
			{ startPage: 4, endPage: 9, studentName: "C", confidence: 1 },
		]
		expect(snapBlankStartPages(scripts, blanks(2, 3), 10)).toEqual([
			{ startPage: 0, endPage: 3, studentName: "A", confidence: 1 },
			{ startPage: 4, endPage: 9, studentName: "B", confidence: 1 },
		])
	})

	it("drops a script that lives entirely in trailing blank pages", () => {
		// B=[4..5] but both pages are blank. B walks to 6 = totalPages → drop.
		const scripts: SegmentedScript[] = [
			{ startPage: 0, endPage: 3, studentName: "A", confidence: 1 },
			{ startPage: 4, endPage: 5, studentName: "B", confidence: 1 },
		]
		expect(snapBlankStartPages(scripts, blanks(4, 5), 6)).toEqual([
			{ startPage: 0, endPage: 5, studentName: "A", confidence: 1 },
		])
	})

	it("returns empty for empty input", () => {
		expect(snapBlankStartPages([], blanks(0, 1, 2), 5)).toEqual([])
	})

	it("preserves studentName (including null) on snapped scripts", () => {
		const scripts: SegmentedScript[] = [
			{ startPage: 0, endPage: 0, studentName: null, confidence: 1 },
			{ startPage: 1, endPage: 4, studentName: "B", confidence: 1 },
		]
		const out = snapBlankStartPages(scripts, blanks(1), 5)
		expect(out).toEqual([
			{ startPage: 0, endPage: 1, studentName: null, confidence: 1 },
			{ startPage: 2, endPage: 4, studentName: "B", confidence: 1 },
		])
	})

	it("preserves per-script confidence through snapping", () => {
		const scripts: SegmentedScript[] = [
			{ startPage: 0, endPage: 4, studentName: "A", confidence: 0.92 },
			{ startPage: 5, endPage: 9, studentName: "B", confidence: 0.55 },
		]
		const out = snapBlankStartPages(scripts, blanks(5), 10)
		expect(out.map((s) => s.confidence)).toEqual([0.92, 0.55])
	})
})

// Sanity check on the data flow these three compose: the LLM emits raw
// pageCounts → lengthsToRanges → snapBlankStartPages → validateScripts.
// A clean run with no model errors should round-trip to ok.
describe("composition (raw lengths → snap → validate)", () => {
	it("happy path: well-formed lengths, no blanks, validates ok", () => {
		const raw: RawSegmentedScript[] = [
			{ pageCount: 3, studentName: "A", confidence: 1 },
			{ pageCount: 4, studentName: "B", confidence: 1 },
			{ pageCount: 3, studentName: "C", confidence: 1 },
		]
		const ranges = lengthsToRanges(raw)
		const snapped = snapBlankStartPages(ranges, new Set(), 10)
		expect(validateScripts(snapped, 10).ok).toBe(true)
	})

	it("model error recovered by snapping: blank-on-boundary still validates ok", () => {
		// LLM said A=2 pages, B=8 pages — but page 2 (B's start) is blank.
		// After snapping A absorbs the blank and B starts at page 3.
		const raw: RawSegmentedScript[] = [
			{ pageCount: 2, studentName: "A", confidence: 1 },
			{ pageCount: 8, studentName: "B", confidence: 1 },
		]
		const ranges = lengthsToRanges(raw)
		const snapped = snapBlankStartPages(ranges, new Set([2]), 10)
		expect(snapped).toEqual([
			{ startPage: 0, endPage: 2, studentName: "A", confidence: 1 },
			{ startPage: 3, endPage: 9, studentName: "B", confidence: 1 },
		])
		expect(validateScripts(snapped, 10).ok).toBe(true)
	})
})

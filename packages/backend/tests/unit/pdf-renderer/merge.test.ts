import { PDFDocument } from "pdf-lib"
import { describe, expect, it } from "vitest"

import { mergeSections } from "../../../src/processors/pdf-renderer/merge"

const A4 = [595.28, 841.89] as const

async function pdfWithPages(count: number): Promise<Uint8Array> {
	const doc = await PDFDocument.create()
	for (let i = 0; i < count; i++) doc.addPage([...A4])
	return doc.save()
}

describe("mergeSections", () => {
	it("rejects an empty list", async () => {
		await expect(mergeSections([], "duplex")).rejects.toThrow(
			/at least one section/,
		)
	})

	it("concatenates without padding when printLayout is 'none'", async () => {
		const sections = await Promise.all([
			pdfWithPages(1), // cover
			pdfWithPages(3), // student A
			pdfWithPages(2), // student B
		])
		const { pageCount } = await mergeSections(sections, "none")
		expect(pageCount).toBe(1 + 3 + 2)
	})

	it("pads each section to a duplex boundary", async () => {
		const sections = await Promise.all([
			pdfWithPages(1), // cover  → +1 blank to reach 2
			pdfWithPages(3), // A      → +1 blank to reach 4 cumulative -> running total 6
			pdfWithPages(2), // B      → 0 (already at 8)
		])
		// Cumulative trace: 1 → pad → 2 ; +3 → 5 → pad → 6 ; +2 → 8 → pad → 8
		const { pageCount } = await mergeSections(sections, "duplex")
		expect(pageCount).toBe(8)
	})

	it("pads each section to a 4-up boundary (duplex_2up)", async () => {
		const sections = await Promise.all([
			pdfWithPages(1), // cover → pad to 4
			pdfWithPages(3), // A     → 4 + 3 = 7 → pad to 8
			pdfWithPages(2), // B     → 8 + 2 = 10 → pad to 12
		])
		const { pageCount } = await mergeSections(sections, "duplex_2up")
		expect(pageCount).toBe(12)
	})

	it("does not insert blanks when a section already lands on the boundary", async () => {
		// Two duplex-aligned sections (2 pages each) → no padding.
		const sections = await Promise.all([pdfWithPages(2), pdfWithPages(2)])
		const { pageCount } = await mergeSections(sections, "duplex")
		expect(pageCount).toBe(4)
	})

	it("handles a single-section export (no concatenation, just trailing pad)", async () => {
		const sections = [await pdfWithPages(3)]
		const { pageCount } = await mergeSections(sections, "duplex")
		expect(pageCount).toBe(4)
	})

	it("returns valid bytes that round-trip through pdf-lib", async () => {
		const sections = await Promise.all([pdfWithPages(1), pdfWithPages(2)])
		const { bytes } = await mergeSections(sections, "duplex")
		const reloaded = await PDFDocument.load(bytes)
		expect(reloaded.getPageCount()).toBeGreaterThan(0)
	})
})

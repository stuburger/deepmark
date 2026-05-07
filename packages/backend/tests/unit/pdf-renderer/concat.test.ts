import { PDFDocument } from "pdf-lib"
import { describe, expect, it } from "vitest"

import {
	padToBoundary,
	paddingFor,
} from "../../../src/processors/pdf-renderer/concat"

const A4 = [595.28, 841.89] as const

async function docWithPages(count: number): Promise<PDFDocument> {
	const doc = await PDFDocument.create()
	for (let i = 0; i < count; i++) doc.addPage([...A4])
	return doc
}

describe("paddingFor", () => {
	it("returns 1 for 'none' (no padding)", () => {
		expect(paddingFor("none")).toBe(1)
	})

	it("returns 2 for 'duplex' (front + back of one sheet)", () => {
		expect(paddingFor("duplex")).toBe(2)
	})

	it("returns 4 for 'duplex_2up' (4 sides per physical sheet)", () => {
		expect(paddingFor("duplex_2up")).toBe(4)
	})
})

describe("padToBoundary", () => {
	it("is a no-op when multiple ≤ 1", async () => {
		const doc = await docWithPages(3)
		padToBoundary(doc, 1)
		expect(doc.getPageCount()).toBe(3)
	})

	it("is a no-op when count is already a multiple", async () => {
		const doc = await docWithPages(4)
		padToBoundary(doc, 2)
		expect(doc.getPageCount()).toBe(4)
	})

	it("rounds up to the next duplex boundary", async () => {
		const doc = await docWithPages(3)
		padToBoundary(doc, 2)
		expect(doc.getPageCount()).toBe(4)
	})

	it("rounds up to the next 4-up boundary", async () => {
		const doc = await docWithPages(5)
		padToBoundary(doc, 4)
		expect(doc.getPageCount()).toBe(8)
	})

	it("only adds blank pages — existing pages are preserved", async () => {
		const doc = await docWithPages(1)
		const originalIndices = doc.getPageIndices()
		padToBoundary(doc, 4)
		expect(doc.getPageCount()).toBe(4)
		// Original page is still index 0; the appended pages come after.
		expect(doc.getPageIndices().slice(0, originalIndices.length)).toEqual(
			originalIndices,
		)
	})

	it("noop on an empty doc when multiple ≤ 1", async () => {
		const doc = await docWithPages(0)
		padToBoundary(doc, 1)
		expect(doc.getPageCount()).toBe(0)
	})

	it("does not pad an empty doc (0 % anything === 0)", async () => {
		// Documented behaviour: 0 is already on every multiple's boundary, so
		// padToBoundary doesn't manufacture blanks. Callers that need at least
		// one page must guarantee it themselves.
		const doc = await docWithPages(0)
		padToBoundary(doc, 4)
		expect(doc.getPageCount()).toBe(0)
	})
})

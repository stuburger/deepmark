import type { PDFDocument } from "pdf-lib"

import type { PrintLayout } from "./schema"

const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89

/**
 * How many physical printer pages share one "sheet" for the chosen layout.
 * `duplex` is 1 sheet = 2 sides; `duplex_2up` is 1 sheet = 4 sides
 * (front/back × 2-up). Padding to a multiple of this prevents two students
 * from bleeding onto the same sheet.
 */
export function paddingFor(layout: PrintLayout): number {
	if (layout === "duplex") return 2
	if (layout === "duplex_2up") return 4
	return 1
}

/**
 * Pad the document with blank A4 pages so the cumulative page count is a
 * multiple of `multiple`. Operating on the cumulative total (not each
 * section's own length) lets the cover share a sheet with the first student
 * if the cover happens to be exactly one page — only the *boundary between
 * students* matters for keeping individual scripts intact on duplex.
 */
export function padToBoundary(doc: PDFDocument, multiple: number): void {
	if (multiple <= 1) return
	const remainder = doc.getPageCount() % multiple
	if (remainder === 0) return
	const blanks = multiple - remainder
	for (let i = 0; i < blanks; i++) {
		doc.addPage([A4_WIDTH, A4_HEIGHT])
	}
}

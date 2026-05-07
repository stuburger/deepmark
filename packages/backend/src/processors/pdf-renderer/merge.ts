import { PDFDocument } from "pdf-lib"

import { padToBoundary, paddingFor } from "./concat"
import type { PrintLayout } from "./schema"

/**
 * Concatenate independently-printed section PDFs (cover + each student)
 * into a single class report, padding between sections so each section
 * opens on a fresh sheet under the chosen `printLayout`.
 *
 * Per-section padding is the whole point of doing the per-section render
 * dance: with one big HTML print, two students would share a duplex
 * sheet whenever the first student's section had an odd page count.
 *
 * The function is pure (in: ordered byte buffers; out: byte buffer) so
 * it's testable without invoking Chromium — see merge.test.ts.
 */
export async function mergeSections(
	sectionPdfs: Uint8Array[],
	printLayout: PrintLayout,
): Promise<{ bytes: Uint8Array; pageCount: number }> {
	if (sectionPdfs.length === 0) {
		throw new Error("mergeSections: at least one section is required")
	}
	const out = await PDFDocument.create()
	const sheetSize = paddingFor(printLayout)

	for (const sectionBytes of sectionPdfs) {
		const src = await PDFDocument.load(sectionBytes)
		const indices = src.getPageIndices()
		const copied = await out.copyPages(src, indices)
		for (const page of copied) out.addPage(page)
		// Pad after each section so the next section opens on a fresh sheet.
		// No-op for `printLayout === "none"` (sheetSize === 1) and for
		// sections that already land on a boundary.
		padToBoundary(out, sheetSize)
	}

	const bytes = await out.save()
	return { bytes, pageCount: out.getPageCount() }
}

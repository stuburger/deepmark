import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { extractJpegFromPdfPage } from "../../src/lib/script-ingestion/pdf-pages"

/**
 * Regression coverage for the bug where extractJpegFromPdfPage silently
 * returns null when pdf-lib fails to decode a page's embedded JPEG stream.
 *
 * Fixtures are single-page PDFs copied out of a real production upload
 * (y10 class PDF "9dbs5.pdf"). Page 108 of that source has a
 * [FlateDecode /DCTDecode] stream whose inflate fails with "unexpected
 * end of file" inside pdf-lib — producing a silent null return that then
 * got treated as a blank page, dropping real student handwriting from the
 * pipeline.
 */

const FIXTURE_DIR = path.resolve(__dirname, "fixtures/pdf-pages")

function assertJpeg(buf: Buffer | null): asserts buf is Buffer {
	expect(buf, "expected a JPEG buffer, got null").not.toBeNull()
	expect(buf?.length ?? 0).toBeGreaterThan(0)
	// JPEG SOI marker: 0xFF 0xD8
	expect(buf?.[0]).toBe(0xff)
	expect(buf?.[1]).toBe(0xd8)
}

describe("extractJpegFromPdfPage", () => {
	it("returns a JPEG for a normal embedded-DCTDecode stream (happy path)", async () => {
		const bytes = fs.readFileSync(path.join(FIXTURE_DIR, "normal-jpeg-stream.pdf"))
		const jpeg = await extractJpegFromPdfPage(bytes)
		assertJpeg(jpeg)
	})

	it("returns a JPEG when the embedded stream inflate fails (fallback to render)", async () => {
		const bytes = fs.readFileSync(
			path.join(FIXTURE_DIR, "truncated-jpeg-stream.pdf"),
		)
		const jpeg = await extractJpegFromPdfPage(bytes)
		assertJpeg(jpeg)
	})
})

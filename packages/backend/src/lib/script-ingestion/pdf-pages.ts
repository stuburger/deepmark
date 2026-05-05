import { inflateSync } from "node:zlib"
import { concurrencyLimit } from "@/lib/concurrency"
import { s3 } from "@/lib/infra/s3"
import { computeInkDensity } from "@/lib/scan-extraction/blank-detection"
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import * as mupdf from "mupdf"
import { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef } from "pdf-lib"
import { Resource } from "sst"
import { appendJobEvent } from "./job-events"
import type { PageData } from "./types"

// Emit a pages_extracted progress event every N pages (plus a terminal one
// at the end). For 700 pages: 7 progress emissions vs. 700-per-page noise.
const EXTRACT_PROGRESS_STRIDE = 100

// Each in-flight page extract holds two pdf-lib PDFDocument graphs (one for
// the single-page extract, one re-loaded inside extractJpegFromPdfPage), the
// extracted JPEG buffer, and an in-flight S3 PUT. Memory cost ~5 MB peak
// per task, so 8 in flight = ~40 MB — comfortable in 2 GB. pdf-lib + mupdf
// are single-threaded JS/native so the win above ~CPU count is overlapping
// the S3 upload I/O with the next page's parse work. Tuned 4 → 8 after the
// 4-concurrency run timed out at the 4-min wall.
const PAGE_EXTRACT_CONCURRENCY = 8

/**
 * Scale factor for the MuPDF fallback renderer — targets ~144 DPI for an A4
 * page, producing JPEGs of similar resolution to the ~100 DPI embedded
 * scans this pipeline normally handles. Slightly higher than source to
 * avoid losing detail when the fallback fires.
 */
const FALLBACK_RENDER_SCALE = 2.0

const BLANK_THRESHOLD = 0.005

export async function fetchS3Bytes(
	bucket: string,
	key: string,
): Promise<Uint8Array> {
	const cmd = new GetObjectCommand({ Bucket: bucket, Key: key })
	const response = await s3.send(cmd)
	const arr = await response.Body?.transformToByteArray()
	if (!arr?.length) throw new Error(`Empty S3 object: ${key}`)
	return arr
}

/**
 * Splits a multi-page PDF into individual pages, extracting the embedded JPEG
 * image from each page's XObject resources. Pages with no extractable JPEG
 * (or very low ink density) are treated as blank (jpegKey/jpegBuffer = null).
 */
export async function extractPdfPages(
	pdfBytes: Uint8Array,
	batchJobId: string,
	sourceKey: string,
): Promise<PageData[]> {
	const pdfDoc = await PDFDocument.load(pdfBytes)
	const pageCount = pdfDoc.getPageCount()
	const sourceName =
		sourceKey
			.split("/")
			.pop()
			?.replace(/\.[^/.]+$/, "") ?? "page"

	await appendJobEvent(batchJobId, {
		kind: "source_file_started",
		sourceKey,
		totalPages: pageCount,
	})

	let processed = 0
	const pageIndices = Array.from({ length: pageCount }, (_, i) => i)
	const pages = await concurrencyLimit(
		PAGE_EXTRACT_CONCURRENCY,
		pageIndices,
		async (i): Promise<PageData> => {
			const singlePage = await PDFDocument.create()
			const [copiedPage] = await singlePage.copyPages(pdfDoc, [i])
			// biome-ignore lint/style/noNonNullAssertion: copyPages always returns one page for single-index array
			singlePage.addPage(copiedPage!)
			const singlePageBytes = await singlePage.save()

			let result: PageData
			const jpegBytes = await extractJpegFromPdfPage(singlePageBytes)
			if (!jpegBytes) {
				result = { absoluteIndex: i, jpegKey: null, jpegBuffer: null }
			} else {
				const density = await computeInkDensity(jpegBytes)
				if (density < BLANK_THRESHOLD) {
					result = { absoluteIndex: i, jpegKey: null, jpegBuffer: null }
				} else {
					const jpegKey = `batches/${batchJobId}/pages/${sourceName}-${String(i + 1).padStart(3, "0")}.jpg`
					await s3.send(
						new PutObjectCommand({
							Bucket: Resource.ScansBucket.name,
							Key: jpegKey,
							Body: jpegBytes,
							ContentType: "image/jpeg",
						}),
					)
					result = { absoluteIndex: i, jpegKey, jpegBuffer: jpegBytes }
				}
			}

			processed++
			if (processed % EXTRACT_PROGRESS_STRIDE === 0) {
				await appendJobEvent(batchJobId, {
					kind: "pages_extracted",
					sourceKey,
					processed,
					total: pageCount,
				})
			}
			return result
		},
	)

	// Terminal progress event (covers the case where pageCount is not a
	// multiple of the stride).
	await appendJobEvent(batchJobId, {
		kind: "pages_extracted",
		sourceKey,
		processed: pageCount,
		total: pageCount,
	})

	return pages
}

/**
 * Extracts a JPEG for a single-page PDF.
 *
 * Fast path: reach into the page's image XObject and pull the embedded
 * JPEG bytes directly (handles /DCTDecode and [/FlateDecode /DCTDecode]).
 * This is what the overwhelming majority of scanned PDFs need, and it's
 * essentially free — no rendering.
 *
 * Fallback: if the embedded stream can't be extracted (missing XObject,
 * malformed filter chain, truncated Flate stream — yes, this happens in
 * the wild, e.g. 9dbs5.pdf page 108), render the page via MuPDF. MuPDF
 * tolerates ragged streams that pdf-lib chokes on.
 *
 * Returns null only when both paths fail — at which point the page is
 * genuinely unreadable and should be surfaced upstream.
 */
export async function extractJpegFromPdfPage(
	pdfBytes: Uint8Array,
): Promise<Buffer | null> {
	const embedded = await tryExtractEmbeddedJpeg(pdfBytes)
	if (embedded) return embedded
	return await tryRenderPdfPageToJpeg(pdfBytes)
}

async function tryExtractEmbeddedJpeg(
	pdfBytes: Uint8Array,
): Promise<Buffer | null> {
	let pdfDoc: PDFDocument
	try {
		pdfDoc = await PDFDocument.load(pdfBytes)
	} catch {
		return null
	}

	const page = pdfDoc.getPage(0)
	const resources = page.node.Resources()
	if (!resources) return null

	const xObjRef = resources.get(PDFName.of("XObject"))
	if (!xObjRef) return null

	const xObjDictRaw =
		xObjRef instanceof PDFRef ? pdfDoc.context.lookup(xObjRef) : xObjRef
	if (!(xObjDictRaw instanceof PDFDict)) return null

	for (const [, valueRef] of xObjDictRaw.entries()) {
		const rawObj =
			valueRef instanceof PDFRef ? pdfDoc.context.lookup(valueRef) : valueRef
		if (!(rawObj instanceof PDFRawStream)) continue

		const stream = rawObj as PDFRawStream
		const subtypeObj = stream.dict.get(PDFName.of("Subtype"))
		if (!subtypeObj || subtypeObj.toString() !== "/Image") continue

		const filterObj = stream.dict.get(PDFName.of("Filter"))
		const filterStr = filterObj?.toString() ?? ""

		if (filterStr === "/DCTDecode") {
			return Buffer.from(stream.contents)
		}

		// [ /FlateDecode /DCTDecode ] — zlib-wrapped JPEG
		if (filterStr.includes("DCTDecode") && filterStr.includes("FlateDecode")) {
			try {
				return inflateSync(Buffer.from(stream.contents))
			} catch {
				// Truncated/malformed stream — caller falls back to MuPDF render.
				return null
			}
		}
	}

	return null
}

async function tryRenderPdfPageToJpeg(
	pdfBytes: Uint8Array,
): Promise<Buffer | null> {
	try {
		const doc = mupdf.Document.openDocument(
			pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes),
			"application/pdf",
		)
		const page = doc.loadPage(0)
		const pixmap = page.toPixmap(
			mupdf.Matrix.scale(FALLBACK_RENDER_SCALE, FALLBACK_RENDER_SCALE),
			mupdf.ColorSpace.DeviceRGB,
			false,
		)
		return Buffer.from(pixmap.asJPEG(80))
	} catch {
		return null
	}
}

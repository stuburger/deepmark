import { inflateSync } from "zlib"
import { computeInkDensity } from "@/lib/blank-detection"
import { s3 } from "@/lib/s3"
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef } from "pdf-lib"
import { Resource } from "sst"
import type { PageData } from "./types"

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

	const pages = await Promise.all(
		Array.from({ length: pageCount }, async (_, i) => {
			const singlePage = await PDFDocument.create()
			const [copiedPage] = await singlePage.copyPages(pdfDoc, [i])
			singlePage.addPage(copiedPage!)
			const singlePageBytes = await singlePage.save()

			const jpegBytes = await extractJpegFromPdfPage(singlePageBytes)
			if (!jpegBytes) {
				return {
					absoluteIndex: i,
					jpegKey: null,
					jpegBuffer: null,
				} satisfies PageData
			}

			const density = await computeInkDensity(jpegBytes)
			if (density < BLANK_THRESHOLD) {
				return {
					absoluteIndex: i,
					jpegKey: null,
					jpegBuffer: null,
				} satisfies PageData
			}

			const jpegKey = `batches/${batchJobId}/pages/${sourceName}-${String(i + 1).padStart(3, "0")}.jpg`
			await s3.send(
				new PutObjectCommand({
					Bucket: Resource.ScansBucket.name,
					Key: jpegKey,
					Body: jpegBytes,
					ContentType: "image/jpeg",
				}),
			)

			return {
				absoluteIndex: i,
				jpegKey,
				jpegBuffer: jpegBytes,
			} satisfies PageData
		}),
	)

	return pages
}

/**
 * Extracts the first JPEG image from a single-page PDF's XObject resources.
 * Handles both /DCTDecode and [ /FlateDecode /DCTDecode ] filter chains.
 * Returns null if no JPEG image is found (blank/non-image page).
 */
export async function extractJpegFromPdfPage(
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

		// Handle [ /FlateDecode /DCTDecode ] — zlib-wrapped JPEG
		if (filterStr.includes("DCTDecode") && filterStr.includes("FlateDecode")) {
			try {
				return inflateSync(Buffer.from(stream.contents))
			} catch {
				return null
			}
		}
	}

	return null
}

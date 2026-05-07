import { logger } from "@/lib/infra/logger"

import { mergeSections } from "./merge"
import { htmlToPdf } from "./print"
import { s3GetText, s3PutPdf } from "./s3-io"
import { type PdfRendererResponse, pdfRendererRequestSchema } from "./schema"

const TAG = "pdf-renderer"

/**
 * Class-report PDF renderer.
 *
 * 1. Read each section's `input.html` from S3 (cover + per student).
 * 2. Print each with headless Chromium (`puppeteer-core` + `@sparticuz/chromium`).
 * 3. Concat with sheet-boundary padding between each section so each
 *    student opens on a fresh duplex sheet.
 * 4. Upload `output.pdf`.
 *
 * The Lambda is intentionally unaware of the report's content — it's a
 * generic html-to-pdf pipeline. The action server-renders the React class
 * report into per-section HTML; this handler bakes and stitches them.
 * See PDF-RENDERER-PLAN.md.
 */
export async function handler(event: unknown): Promise<PdfRendererResponse> {
	const startedAt = Date.now()
	let jobId = "unknown"
	try {
		const request = pdfRendererRequestSchema.parse(event)
		jobId = request.jobId
		logger.info(TAG, "Render started", {
			jobId,
			sectionCount: request.sections.length,
			output: `s3://${request.output.bucket}/${request.output.key}`,
			printLayout: request.printLayout,
		})

		// Fetch all section HTML in parallel — S3 latency dominates over
		// printing for small sections, so concurrency here saves real time.
		const htmls = await Promise.all(
			request.sections.map((ref) => s3GetText(ref)),
		)

		// Print sequentially. We could pipeline pages on a single browser
		// instance (puppeteer supports `newPage()` concurrently) but a 25-
		// student class would have 25 pages live at once and chromium's
		// memory growth becomes the binding constraint before render
		// throughput does. Sequential keeps the Lambda comfortably under
		// the 3 GB allotment.
		const sectionPdfs: Uint8Array[] = []
		for (let i = 0; i < htmls.length; i++) {
			const html = htmls[i] as string
			const section = request.sections[i] as (typeof request.sections)[number]
			sectionPdfs.push(
				await htmlToPdf(html, { footerLabel: section.footerLabel }),
			)
		}

		const final = await mergeSections(sectionPdfs, request.printLayout)
		await s3PutPdf(request.output, final.bytes)

		const durationMs = Date.now() - startedAt
		logger.info(TAG, "Render finished", {
			jobId,
			pageCount: final.pageCount,
			sizeBytes: final.bytes.byteLength,
			durationMs,
		})
		return {
			ok: true,
			pageCount: final.pageCount,
			sizeBytes: final.bytes.byteLength,
			durationMs,
		}
	} catch (err) {
		const durationMs = Date.now() - startedAt
		const message = err instanceof Error ? err.message : String(err)
		logger.error(TAG, "Render failed", { jobId, error: message, durationMs })
		return { ok: false, error: message, durationMs }
	}
}

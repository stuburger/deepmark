import { scansBucket } from "./storage"

/**
 * Class-report renderer. Sync-invoked by the Next.js export action with
 * an S3 `input.html` + `output.pdf` reference; the Lambda has no app-domain
 * knowledge — it just navigates HTML in headless Chromium and prints.
 *
 * - 3 GB RAM: chromium's working set on a real class export sits around
 *   1.2 GB; headroom keeps us off the OOM line during page paint.
 * - 5 min timeout: covers a cold-start chromium boot (~1.5 s) plus the
 *   actual print, with margin for the largest classes we expect.
 * - `nodejs.install` lists the chromium binary package so SST keeps it
 *   in node_modules instead of esbuild-bundling it (the binary is a
 *   separate brotli-compressed asset that breaks under bundling).
 *
 * See PDF-RENDERER-PLAN.md.
 */
export const pdfRendererFn = new sst.aws.Function("PdfRenderer", {
	handler: "packages/backend/src/processors/pdf-renderer/handler.handler",
	link: [scansBucket],
	timeout: "5 minutes",
	memory: "3 GB",
	nodejs: { install: ["@sparticuz/chromium", "puppeteer-core"] },
})

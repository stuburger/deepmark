import { existsSync } from "node:fs"
import { PDFDocument } from "pdf-lib"
import { afterAll, describe, expect, it } from "vitest"

import { htmlToPdf } from "../../../src/processors/pdf-renderer/print"

/**
 * Local-only Chromium smoke test for the renderer pipeline.
 *
 * Catches CSS-only regressions (broken `@page`, busted `break-inside`,
 * margin typos) that the HTML snapshot tests can't see — the snapshot
 * tests verify markup, this verifies what Chromium actually prints.
 *
 * Skipped automatically if no Chrome binary is reachable (CI without
 * Chromium installed). To run elsewhere, set `PUPPETEER_EXECUTABLE_PATH`
 * to a chromium-compatible binary. Locally on macOS, the default Chrome
 * install path is used by `chromium.ts`.
 */
const macOsChromePath =
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH ?? macOsChromePath
const chromeAvailable = existsSync(chromePath)

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Smoke fixture</title>
<style>
@page { size: A4; margin: 16mm; }
body { font-family: -apple-system, sans-serif; color: #111; }
.page-1 { break-after: page; page-break-after: always; }
h1 { font-size: 24pt; }
</style>
</head>
<body>
<section class="page-1">
<h1>Smoke fixture — page 1</h1>
<p>Forced page break follows.</p>
</section>
<section>
<h1>Smoke fixture — page 2</h1>
<p>Sentinel: SMOKE_OK</p>
</section>
</body>
</html>`

describe.skipIf(!chromeAvailable)("htmlToPdf (Chromium-backed smoke)", () => {
	// Browser cleanup: vitest forks a process per test file, so the
	// module-scoped browser cache dies with the process. The afterAll
	// hook is here for the future-proofing of running this in a shared-
	// process pool.
	afterAll(async () => {
		const { getBrowser } = await import(
			"../../../src/processors/pdf-renderer/chromium"
		)
		try {
			const browser = await getBrowser()
			if (browser.connected) await browser.close()
		} catch {
			// Browser may already have been closed by another test;
			// nothing to clean up.
		}
	}, 10_000)

	it("produces a valid PDF with the expected page count and size", async () => {
		const bytes = await htmlToPdf(FIXTURE_HTML)
		expect(bytes.byteLength).toBeGreaterThan(4 * 1024)

		const doc = await PDFDocument.load(bytes)
		// CSS `break-after: page` should produce two pages — if the
		// rule is silently dropped (e.g. a typo in the @page block
		// or a regression in `preferCSSPageSize`), this fails.
		expect(doc.getPageCount()).toBe(2)
	}, 60_000)

	it("renders a custom footer label when supplied", async () => {
		// We can't easily extract footer text out of a PDF without
		// adding `pdf-parse`. Instead, smoke that the call succeeds
		// with a label parameter — the schema + handler tests cover
		// the wiring; this is the "Chromium accepts the template
		// shape" check.
		const bytes = await htmlToPdf(FIXTURE_HTML, {
			footerLabel: "Pat Doe",
		})
		expect(bytes.byteLength).toBeGreaterThan(4 * 1024)
	}, 60_000)
})

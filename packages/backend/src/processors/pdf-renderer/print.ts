import { getBrowser } from "./chromium"

export type PrintOptions = {
	/**
	 * Right-side label in the running footer (e.g. "Cover", "Annotation
	 * key", a student's name). Page numbers always render — this is the
	 * only piece that varies per section.
	 */
	footerLabel?: string
}

/**
 * Print HTML to a PDF byte buffer using the cached headless Chromium.
 *
 * `setContent` blocks the function until the document reaches the chosen
 * `waitUntil` state. We pick `networkidle0` (no in-flight requests for
 * 500 ms) so any inlined image data URIs / font face declarations have
 * resolved before we print. For HTML that contains no async assets the
 * wait is essentially free.
 *
 * `preferCSSPageSize` lets the document override our default A4 via its
 * own `@page` rule — the print stylesheet is the source of truth for
 * page geometry.
 *
 * Header / footer rendering uses Chromium's `displayHeaderFooter` rather
 * than CSS `@page @bottom-*` running content, because we need a per-section
 * label that varies between print calls. Header/footer templates do NOT
 * inherit document CSS — they're rendered in a separate context — so all
 * styling is inlined in the template HTML.
 */
export async function htmlToPdf(
	html: string,
	options: PrintOptions = {},
): Promise<Uint8Array> {
	const browser = await getBrowser()
	const page = await browser.newPage()
	try {
		await page.setContent(html, {
			waitUntil: "networkidle0",
			timeout: 60_000,
		})
		await page.emulateMediaType("print")
		const buffer = await page.pdf({
			format: "A4",
			printBackground: true,
			preferCSSPageSize: true,
			margin: {
				top: "16mm",
				right: "16mm",
				bottom: "16mm",
				left: "16mm",
			},
			displayHeaderFooter: true,
			headerTemplate: EMPTY_TEMPLATE,
			footerTemplate: buildFooterTemplate(options.footerLabel),
		})
		// puppeteer returns a Buffer; normalise to Uint8Array for the rest of
		// the pipeline (pdf-lib + S3 PutObject both accept either, but a single
		// type makes the contract clearer).
		return new Uint8Array(buffer)
	} finally {
		await page.close()
	}
}

// `displayHeaderFooter` requires both templates. We don't render a header,
// but Chromium needs a non-empty wrapper or it falls back to its own
// default header (page title + URL).
const EMPTY_TEMPLATE = '<div style="display:none"></div>'

function buildFooterTemplate(label: string | undefined): string {
	const safeLabel = escapeHtml(label ?? "DeepMark")
	return `
		<div style="
			width: 100%;
			padding: 0 16mm;
			font-size: 7.5pt;
			color: #9CA3AF;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			display: flex;
			justify-content: space-between;
			align-items: center;
		">
			<span>DeepMark</span>
			<span>${safeLabel}</span>
			<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
		</div>
	`
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (ch) => {
		switch (ch) {
			case "&":
				return "&amp;"
			case "<":
				return "&lt;"
			case ">":
				return "&gt;"
			case '"':
				return "&quot;"
			default:
				return "&#39;"
		}
	})
}

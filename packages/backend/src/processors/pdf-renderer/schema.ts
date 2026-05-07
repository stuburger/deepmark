import { z } from "zod"

/**
 * Wire format between the export server action and the renderer Lambda.
 *
 * The action splits the class report into independent HTML sections —
 * cover (omitted for single-student exports) and one per student — and
 * uploads each to S3. The Lambda prints each section with Chromium, then
 * concatenates with sheet-boundary padding between sections so each
 * student lands on a fresh duplex sheet. See PDF-RENDERER-PLAN.md.
 */

const s3Ref = z.object({
	bucket: z.string().min(1),
	key: z.string().min(1),
})
export type S3Ref = z.infer<typeof s3Ref>

const sectionRef = s3Ref.extend({
	/**
	 * Optional human-readable label for the running footer of this section
	 * (e.g. "Cover", "Annotation key", student name). The Lambda passes
	 * this through to Chromium's `displayHeaderFooter` template so a
	 * teacher flicking through a printed class report has a per-page
	 * anchor on every sheet.
	 */
	footerLabel: z.string().optional(),
})
export type SectionRef = z.infer<typeof sectionRef>

export const printLayoutSchema = z.enum(["none", "duplex", "duplex_2up"])
export type PrintLayout = z.infer<typeof printLayoutSchema>

export const pdfRendererRequestSchema = z.object({
	jobId: z.string().min(1),
	sections: z.array(sectionRef).min(1),
	output: s3Ref,
	printLayout: printLayoutSchema,
})
export type PdfRendererRequest = z.infer<typeof pdfRendererRequestSchema>

export type PdfRendererResponse =
	| {
			ok: true
			pageCount: number
			sizeBytes: number
			durationMs: number
	  }
	| {
			ok: false
			error: string
			durationMs: number
	  }

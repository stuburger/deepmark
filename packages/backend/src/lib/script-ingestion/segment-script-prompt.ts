import { z } from "zod/v4"

/**
 * Output schema for the single-call PDF segmentation.
 *
 * The model returns one entry per student script, in order, with the
 * number of pages each script occupies. Ranges are derived by cumulative
 * sum in the caller — this shape makes it structurally impossible to emit
 * overlapping or gapped ranges as long as the pageCount sum is validated.
 */
export const SegmentationSchema = z.object({
	scripts: z
		.array(
			z.object({
				pageCount: z.number().int().min(1),
				studentName: z.string().nullable(),
			}),
		)
		.min(1),
})

export type SegmentationOutput = z.infer<typeof SegmentationSchema>

const SEGMENTATION_INSTRUCTIONS = `You are segmenting a scanned multi-student exam PDF into individual student scripts.

Below is the OCR output for every page in order. Each page shows:
- A "TOP:" section containing any text detected in the top 15% of the page — this is where students typically write their names.
- A "BODY:" section with the rest of the page's text.
- Pages with no text are marked "[blank]" — treat these as unused answer space, not separators.

The teacher guarantees:
- All pages are in order.
- The PDF is complete — it contains one or more full student scripts, nothing else.
- Scripts can be variable length (stronger students write longer answers; weaker students write fewer pages).

Your task: return one entry per student script, in order. For each:
- pageCount: the number of pages this student's script occupies (>= 1).
- studentName: the name if legible (usually in the TOP: section of the first page), else null.

The first entry's pageCount starts at page 0; each subsequent entry continues from where the previous one ended.

Hard rules:
- The SUM of all pageCount values MUST equal the total page count stated below. Do not return a sum that is larger or smaller.
- A blank page is NEVER a script on its own. Blank pages count toward the PRECEDING student's pageCount (unused answer space they left).
- Every distinct student gets exactly one entry — do not list the same student twice.

Cues that a page starts a NEW student's script, in order of reliability:
1. A name in the TOP: section that wasn't there on previous pages.
2. Section A / Question 1.1 restarting in the BODY.
3. OCR'd text whose style/content is clearly a new student's work (different answer patterns).

Student name rule: prefer the name you see in the TOP: section verbatim. If no TOP text or nothing name-like, return null. Do NOT invent a name.

Return ONLY the structured output — no commentary.`

export type PageTextBlock =
	| { order: number; empty: true }
	| { order: number; empty: false; top: string; body: string }

export function buildSegmentationPrompt({
	totalPages,
	blankIndices,
	pages,
}: {
	totalPages: number
	blankIndices: number[]
	pages: PageTextBlock[]
}): string {
	const textBlocks = pages.map((p) => {
		if (p.empty) return `Page ${p.order}: [blank]`
		const top = p.top.trim() || "(no text at top)"
		const body = p.body.trim() || "(no body text)"
		return `Page ${p.order}:\nTOP: ${top}\nBODY: ${body}`
	})

	return `${SEGMENTATION_INSTRUCTIONS}

The PDF has ${totalPages} pages total (indices 0 to ${totalPages - 1}).
Blank pages: ${blankIndices.length > 0 ? blankIndices.join(", ") : "(none)"}.

Page OCR follows:

${textBlocks.join("\n\n")}

End of OCR. Return the ordered list of scripts. Remember: the SUM of all pageCount values MUST equal ${totalPages}.`
}

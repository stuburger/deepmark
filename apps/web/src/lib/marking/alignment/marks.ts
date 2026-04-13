import { resolveSignal } from "../mark-registry"
import type { StudentPaperAnnotation } from "../types"
import type { AnnotationSignal, TextMark, TokenAlignment } from "./types"

function resolveMarkType(
	annotation: StudentPaperAnnotation,
): AnnotationSignal | null {
	return resolveSignal(
		annotation.overlay_type,
		annotation.payload as Record<string, unknown>,
	)
}

/**
 * Derives PM-style TextMarks from annotations using the token alignment map.
 * Skips annotations without valid anchor tokens or failed alignment lookups.
 */
export function deriveTextMarks(
	annotations: StudentPaperAnnotation[],
	alignment: TokenAlignment,
): TextMark[] {
	const marks: TextMark[] = []

	for (const a of annotations) {
		if (!a.anchor_token_start_id || !a.anchor_token_end_id) continue

		const startOffset = alignment.tokenMap[a.anchor_token_start_id]
		const endOffset = alignment.tokenMap[a.anchor_token_end_id]
		if (!startOffset || !endOffset) continue

		const from = startOffset.start
		const to = endOffset.end
		if (from >= to) continue

		const type = resolveMarkType(a)
		if (!type) continue

		const sentiment = (a.sentiment ?? "neutral") as TextMark["sentiment"]

		// Extract relevant attrs from payload
		const payload = a.payload as Record<string, unknown>
		const attrs: Record<string, unknown> = {}
		if (payload.reason) attrs.reason = payload.reason
		if (payload.label) attrs.label = payload.label
		if (payload.ao_category) attrs.ao_category = payload.ao_category
		if (payload.ao_display) attrs.ao_display = payload.ao_display
		if (payload.ao_quality) attrs.ao_quality = payload.ao_quality
		if (payload.comment) attrs.comment = payload.comment
		if (payload.chainType) attrs.chainType = payload.chainType
		if (payload.phrase) attrs.phrase = payload.phrase

		marks.push({ from, to, type, sentiment, attrs, annotationId: a.id })
	}

	return marks.sort((a, b) => a.from - b.from)
}

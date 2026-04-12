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
		if (payload.text) attrs.text = payload.text
		if (payload.category) attrs.category = payload.category
		if (payload.display) attrs.display = payload.display
		if (payload.awarded !== undefined) attrs.awarded = payload.awarded
		if (payload.quality) attrs.quality = payload.quality
		if (payload.chainType) attrs.chainType = payload.chainType
		if (payload.phrase) attrs.phrase = payload.phrase

		marks.push({ from, to, type, sentiment, attrs, annotationId: a.id })
	}

	return marks.sort((a, b) => a.from - b.from)
}

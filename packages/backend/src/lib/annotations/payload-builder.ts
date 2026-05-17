import type { AnnotationPayload } from "@mcp-gcse/shared"
import type { AnnotationPlanItem } from "./annotation-schema"

type BuiltOverlay = { overlayType: "annotation"; payload: AnnotationPayload }

/**
 * Builds the overlay + typed payload pair for a PendingAnnotation from an
 * LLM plan item. The schema requires `signal` and `reason`; if Gemini somehow
 * returns an item missing either (Zod parse would normally catch this; this
 * is belt-and-suspenders), return null and let the caller log + drop.
 *
 * TODO: chain annotations (highlighted reasoning connectives) used to be
 * produced here. Removed 2026-05-17 because the LLM rarely generated them,
 * they weren't tied to mark scheme decisions, and they were a source of
 * empty-output bugs (see Q4 in the 2026-05-16 smoke test). The persistence
 * layer + UI renderer still support them, so a focused chain-generation
 * pass can be added later as its own concern.
 */
export function buildOverlay(item: AnnotationPlanItem): BuiltOverlay | null {
	if (!item.signal || !item.reason) return null

	const payload: AnnotationPayload = {
		_v: 1,
		signal: item.signal,
		reason: item.reason,
		...(item.label ? { label: item.label } : {}),
		...(item.ao_category
			? {
					ao_category: item.ao_category,
					ao_display: item.ao_category,
					ao_quality: item.ao_quality ?? "valid",
				}
			: {}),
		...(item.comment ? { comment: item.comment } : {}),
	}
	return { overlayType: "annotation", payload }
}

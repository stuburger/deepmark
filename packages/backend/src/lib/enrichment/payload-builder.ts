import type { AnnotationPlanItem } from "./annotation-schema"

/**
 * Determines whether an LLM annotation plan item is a signal annotation
 * (has signal field) or a chain (has chain_type field).
 */
function isSignalAnnotation(item: AnnotationPlanItem): boolean {
	return item.signal !== undefined
}

/**
 * Builds a typed payload record from an LLM annotation plan item.
 * Two paths: signal annotation (with optional AO + comment) or chain.
 */
export function buildPayload(
	item: AnnotationPlanItem,
): Record<string, unknown> {
	if (isSignalAnnotation(item)) {
		return {
			_v: 2,
			signal: item.signal ?? "tick",
			reason: item.reason ?? "",
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
	}

	// Chain
	return {
		_v: 2,
		chainType: item.chain_type ?? "reasoning",
		phrase: item.trigger_phrase ?? "",
	}
}

/**
 * Infers the overlay_type from the LLM plan item fields.
 */
export function inferOverlayType(
	item: AnnotationPlanItem,
): "annotation" | "chain" {
	return isSignalAnnotation(item) ? "annotation" : "chain"
}

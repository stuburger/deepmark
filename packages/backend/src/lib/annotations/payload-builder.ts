import type { AnnotationPayload, ChainPayload } from "@mcp-gcse/shared"
import type { AnnotationPlanItem } from "./annotation-schema"

type BuiltOverlay =
	| { overlayType: "annotation"; payload: AnnotationPayload }
	| { overlayType: "chain"; payload: ChainPayload }

function isSignalAnnotation(item: AnnotationPlanItem): boolean {
	return item.signal !== undefined
}

/**
 * Builds the overlayType + typed payload pair for a PendingAnnotation from an
 * LLM plan item. Returned as a correlated object so the discriminated union
 * narrows correctly at the call site (vs. two separate calls that TS cannot
 * correlate).
 */
export function buildOverlay(item: AnnotationPlanItem): BuiltOverlay {
	if (isSignalAnnotation(item)) {
		const payload: AnnotationPayload = {
			_v: 1,
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
		return { overlayType: "annotation", payload }
	}

	const payload: ChainPayload = {
		_v: 1,
		chainType: item.chain_type ?? "reasoning",
		phrase: item.trigger_phrase ?? "",
	}
	return { overlayType: "chain", payload }
}

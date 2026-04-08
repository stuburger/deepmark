import type { AnnotationPlanItem } from "./annotation-schema"
import { aoDisplayLabel } from "./ao-display"

export function buildPayload(
	item: AnnotationPlanItem,
	examBoard: string | null,
): Record<string, unknown> {
	switch (item.overlay_type) {
		case "mark":
			return {
				_v: 1,
				signal: item.signal ?? "tick",
				...(item.label ? { label: item.label } : {}),
				...(item.reason ? { reason: item.reason } : {}),
			}
		case "tag":
			return {
				_v: 1,
				category: item.category ?? "AO1",
				display: aoDisplayLabel(examBoard, item.category ?? "AO1"),
				awarded: item.awarded ?? true,
				quality: item.quality ?? "valid",
				...(item.reason ? { reason: item.reason } : {}),
			}
		case "comment":
			return {
				_v: 1,
				text: item.comment_text ?? "",
			}
		case "chain":
			return {
				_v: 1,
				chainType: item.chain_type ?? "reasoning",
				phrase: item.trigger_phrase ?? "",
			}
		default:
			return { _v: 1 }
	}
}

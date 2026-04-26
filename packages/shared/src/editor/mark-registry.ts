/**
 * Single source of truth for all annotation mark types.
 *
 * Every mark type is defined once here. The rest of the codebase derives
 * lookup tables, tiptap extension names, and UI metadata from this registry.
 * Adding a new mark type means adding one entry here — not five separate files.
 */
import type {
	AnnotationPayload,
	AnyAnnotationPayload,
	MarkSignal,
	OverlayType,
} from "../annotation/types"
import { MARK_SIGNAL_NAMES } from "../annotation/types"
import type { AnnotationSignal } from "./alignment/types"

export type MarkRegistryEntry = {
	/** Domain-level signal name (e.g. "tick", "underline", "chain") */
	signal: AnnotationSignal
	/** Tiptap mark extension name (e.g. "annotationUnderline") */
	tiptapName: string
	/** Which overlay category this mark belongs to */
	overlayType: OverlayType
	/** Build a typed payload from tiptap mark attrs */
	buildPayload: (attrs: Record<string, unknown>) => AnyAnnotationPayload
}

function buildSignalPayload(
	signal: AnnotationPayload["signal"],
	attrs: Record<string, unknown>,
): AnnotationPayload {
	return {
		_v: 1,
		signal,
		reason: (attrs.reason as string) ?? "",
		...(attrs.ao_category
			? {
					ao_category: attrs.ao_category as string,
					ao_display:
						(attrs.ao_display as string) ?? (attrs.ao_category as string),
					ao_quality:
						(attrs.ao_quality as AnnotationPayload["ao_quality"]) ?? "valid",
				}
			: {}),
		...(attrs.comment ? { comment: attrs.comment as string } : {}),
	}
}

export const MARK_REGISTRY: readonly MarkRegistryEntry[] = [
	{
		signal: "tick",
		tiptapName: "tick",
		overlayType: "annotation",
		buildPayload: (a) => buildSignalPayload("tick", a),
	},
	{
		signal: "cross",
		tiptapName: "cross",
		overlayType: "annotation",
		buildPayload: (a) => buildSignalPayload("cross", a),
	},
	{
		signal: "underline",
		tiptapName: "annotationUnderline",
		overlayType: "annotation",
		buildPayload: (a) => buildSignalPayload("underline", a),
	},
	{
		signal: "double_underline",
		tiptapName: "doubleUnderline",
		overlayType: "annotation",
		buildPayload: (a) => buildSignalPayload("double_underline", a),
	},
	{
		signal: "box",
		tiptapName: "box",
		overlayType: "annotation",
		buildPayload: (a) => buildSignalPayload("box", a),
	},
	{
		signal: "circle",
		tiptapName: "circle",
		overlayType: "annotation",
		buildPayload: (a) => buildSignalPayload("circle", a),
	},
	{
		signal: "chain",
		tiptapName: "chain",
		overlayType: "chain",
		buildPayload: (a) =>
			({
				_v: 1,
				chainType: (a.chainType as string) ?? "reasoning",
				phrase: (a.phrase as string) ?? "",
			}) as AnyAnnotationPayload,
	},
] as const

/** Tiptap mark name → registry entry (used when reading PM doc marks) */
export const TIPTAP_TO_ENTRY: ReadonlyMap<string, MarkRegistryEntry> = new Map(
	MARK_REGISTRY.map((e) => [e.tiptapName, e]),
)

/** Domain signal → tiptap mark name (used when building PM doc from TextMarks) */
export const SIGNAL_TO_TIPTAP: Readonly<Record<AnnotationSignal, string>> =
	Object.fromEntries(
		MARK_REGISTRY.map((e) => [e.signal, e.tiptapName]),
	) as Record<AnnotationSignal, string>

/** The set of valid mark signal names (the 6 physical mark signals) */
export const MARK_SIGNALS: ReadonlySet<MarkSignal> = new Set(MARK_SIGNAL_NAMES)

/** Type-guard narrowing an arbitrary string to the `MarkSignal` union. */
export function isMarkSignal(value: string): value is MarkSignal {
	return (MARK_SIGNALS as ReadonlySet<string>).has(value)
}

/** Overlay type → domain signal (used when resolving annotation → TextMark type) */
export function resolveSignal(
	overlayType: OverlayType,
	payload: Record<string, unknown>,
): AnnotationSignal | null {
	switch (overlayType) {
		case "annotation": {
			const signal = payload.signal
			if (typeof signal === "string" && isMarkSignal(signal)) return signal
			return "underline"
		}
		case "chain":
			return "chain"
		default:
			return null
	}
}

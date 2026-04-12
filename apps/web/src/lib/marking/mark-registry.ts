/**
 * Single source of truth for all annotation mark types.
 *
 * Every mark type is defined once here. The rest of the codebase derives
 * lookup tables, tiptap extension names, and UI metadata from this registry.
 * Adding a new mark type means adding one entry here — not five separate files.
 */
import type { AnnotationSignal } from "@/lib/marking/token-alignment"
import type {
	AnnotationPayload,
	MarkPayload,
	OverlayType,
} from "@/lib/marking/types"
import { MARK_SIGNAL_NAMES } from "@mcp-gcse/shared"

// ─── Registry entry ────────────────────────────────────────────────────────

export type MarkRegistryEntry = {
	/** Domain-level signal name (e.g. "tick", "underline", "ao_tag", "chain") */
	signal: AnnotationSignal
	/** Tiptap mark extension name (e.g. "annotationUnderline", "aoTag") */
	tiptapName: string
	/** Which overlay category this mark belongs to */
	overlayType: OverlayType
	/** Build a typed payload from tiptap mark attrs */
	buildPayload: (attrs: Record<string, unknown>) => AnnotationPayload
}

// ─── The registry ──────────────────────────────────────────────────────────

export const MARK_REGISTRY: readonly MarkRegistryEntry[] = [
	{
		signal: "tick",
		tiptapName: "tick",
		overlayType: "mark",
		buildPayload: (a) =>
			({ _v: 1, signal: "tick", reason: a.reason ?? "" }) as MarkPayload,
	},
	{
		signal: "cross",
		tiptapName: "cross",
		overlayType: "mark",
		buildPayload: (a) =>
			({ _v: 1, signal: "cross", reason: a.reason ?? "" }) as MarkPayload,
	},
	{
		signal: "underline",
		tiptapName: "annotationUnderline",
		overlayType: "mark",
		buildPayload: (a) =>
			({
				_v: 1,
				signal: "underline",
				reason: a.reason ?? "",
			}) as MarkPayload,
	},
	{
		signal: "double_underline",
		tiptapName: "doubleUnderline",
		overlayType: "mark",
		buildPayload: (a) =>
			({
				_v: 1,
				signal: "double_underline",
				reason: a.reason ?? "",
			}) as MarkPayload,
	},
	{
		signal: "box",
		tiptapName: "box",
		overlayType: "mark",
		buildPayload: (a) =>
			({ _v: 1, signal: "box", reason: a.reason ?? "" }) as MarkPayload,
	},
	{
		signal: "circle",
		tiptapName: "circle",
		overlayType: "mark",
		buildPayload: (a) =>
			({ _v: 1, signal: "circle", reason: a.reason ?? "" }) as MarkPayload,
	},
	{
		signal: "ao_tag",
		tiptapName: "aoTag",
		overlayType: "tag",
		buildPayload: (a) =>
			({
				_v: 1,
				category: a.category ?? "AO1",
				display: a.display ?? "AO1",
				awarded: a.awarded ?? true,
				quality: a.quality ?? "valid",
				reason: a.reason ?? "",
			}) as AnnotationPayload,
	},
	{
		signal: "chain",
		tiptapName: "chain",
		overlayType: "chain",
		buildPayload: (a) =>
			({
				_v: 1,
				chainType: a.chainType ?? "reasoning",
				phrase: a.phrase ?? "",
			}) as AnnotationPayload,
	},
] as const

// ─── Derived lookup tables ─────────────────────────────────────────────────

/** Tiptap mark name → registry entry (used when reading PM doc marks) */
export const TIPTAP_TO_ENTRY: ReadonlyMap<string, MarkRegistryEntry> = new Map(
	MARK_REGISTRY.map((e) => [e.tiptapName, e]),
)

/** Domain signal → tiptap mark name (used when building PM doc from TextMarks) */
export const SIGNAL_TO_TIPTAP: Readonly<Record<AnnotationSignal, string>> =
	Object.fromEntries(
		MARK_REGISTRY.map((e) => [e.signal, e.tiptapName]),
	) as Record<AnnotationSignal, string>

/** Overlay type → domain signal (used when resolving annotation → TextMark type) */
export function resolveSignal(
	overlayType: OverlayType,
	payload: Record<string, unknown>,
): AnnotationSignal | null {
	switch (overlayType) {
		case "mark": {
			const signal = payload.signal as string | undefined
			if (signal && MARK_SIGNALS.has(signal)) return signal as AnnotationSignal
			return "underline" // fallback for unknown signals
		}
		case "tag":
			return "ao_tag"
		case "chain":
			return "chain"
		case "comment":
			return null
		default:
			return null
	}
}

/** The set of valid mark signal names (the 6 physical mark signals) */
export const MARK_SIGNALS: ReadonlySet<string> = new Set(MARK_SIGNAL_NAMES)

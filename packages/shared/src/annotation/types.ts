import { z } from "zod/v4"

// ============================================
// OVERLAY TYPES
// ============================================

/** The two annotation overlay types: signal annotations and chains. */
export type OverlayType = "annotation" | "chain"

// ============================================
// MARK SIGNAL VOCABULARY
// ============================================

/**
 * The 6 physical mark signals that can appear on a scanned page.
 * Single source of truth — Zod schemas, TypeScript unions, and the
 * web mark registry all derive from this array.
 */
export const MARK_SIGNAL_NAMES = [
	"tick",
	"cross",
	"underline",
	"double_underline",
	"box",
	"circle",
] as const

/** Union type for the 6 physical mark signals. */
export type MarkSignal = (typeof MARK_SIGNAL_NAMES)[number]

// ============================================
// PAYLOAD SCHEMAS (versioned, per overlay type)
// ============================================

/** Structured mark point result for point-based annotations. */
export const MarkPointEntrySchema = z.object({
	point: z.number().int(),
	awarded: z.boolean(),
	criteria: z.string(),
})

/**
 * Annotation: a physical signal placed ON the scanned page (tick, cross, underline, etc.)
 * with optional AO tag data and margin comment — all self-contained in one record.
 */
export const AnnotationPayloadSchema = z.object({
	_v: z.literal(2),
	signal: z.enum(MARK_SIGNAL_NAMES),
	/** Short examiner-style note explaining what this mark refers to. REQUIRED. */
	reason: z.string(),
	/** Optional short label (e.g. "3/4") */
	label: z.string().max(20).optional(),
	/** Optional AO category — "AO1", "AO2", "AO3", etc. */
	ao_category: z.string().optional(),
	/** Exam-board-specific display label — "AO2", "App", "K", etc. */
	ao_display: z.string().optional(),
	/** Quality of the AO skill demonstration */
	ao_quality: z.enum(["strong", "partial", "incorrect", "valid"]).optional(),
	/** Optional margin comment */
	comment: z.string().optional(),
	/** Structured mark point results for point-based annotations. */
	markPoints: z.array(MarkPointEntrySchema).optional(),
})

/** Chain: a connective/reasoning phrase highlighted on the scan */
export const ChainPayloadSchema = z.object({
	_v: z.literal(2),
	chainType: z.enum(["reasoning", "evaluation", "judgement"]),
	/** The trigger phrase matched in the student's text */
	phrase: z.string(),
})

// ============================================
// INFERRED TYPES
// ============================================

export type AnnotationPayload = z.infer<typeof AnnotationPayloadSchema>
export type ChainPayload = z.infer<typeof ChainPayloadSchema>

export type AnyAnnotationPayload = AnnotationPayload | ChainPayload

// ============================================
// PARSE FUNCTION
// ============================================

/**
 * Validate and parse a raw JSON payload based on the overlay type.
 * Throws a ZodError if the payload shape does not match the expected schema.
 */
export function parseAnnotationPayload(
	overlayType: OverlayType,
	raw: unknown,
): AnyAnnotationPayload {
	switch (overlayType) {
		case "annotation":
			return AnnotationPayloadSchema.parse(raw)
		case "chain":
			return ChainPayloadSchema.parse(raw)
	}
}

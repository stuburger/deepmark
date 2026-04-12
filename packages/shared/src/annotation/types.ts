import { z } from "zod/v4"

// ============================================
// OVERLAY TYPES
// ============================================

/** The four annotation overlay types rendered on or alongside a scanned student paper. */
export type OverlayType = "mark" | "tag" | "comment" | "chain"

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

/** Mark: a physical signal placed ON the scanned page (tick, cross, underline, etc.) */
export const MarkPayloadSchema = z.object({
	_v: z.literal(1),
	signal: z.enum(MARK_SIGNAL_NAMES),
	label: z.string().max(20).optional(),
	/** Short examiner-style note explaining what this mark refers to. */
	reason: z.string().max(80).optional(),
	/** Structured mark point results for point-based annotations. */
	markPoints: z.array(MarkPointEntrySchema).optional(),
})

/** Tag: a semantic skill badge attached to a mark (e.g. [AO2]) */
export const TagPayloadSchema = z.object({
	_v: z.literal(1),
	/** Free-string category label — "AO1", "AO2", "M1", "B1", etc. */
	category: z.string(),
	/** Exam-board-specific display label — "AO2", "App", "K", etc. */
	display: z.string(),
	/** Whether the skill was demonstrated (true = tick, false = cross) */
	awarded: z.boolean(),
	/** Quality assessment for the demonstrated skill */
	quality: z.enum(["strong", "partial", "incorrect", "valid"]),
	/** Short examiner-style note explaining what skill was demonstrated. */
	reason: z.string().max(80).optional(),
})

/** Comment: a short margin note rendered in the results panel (not on the scan) */
export const CommentPayloadSchema = z.object({
	_v: z.literal(1),
	/** Format: "[diagnosis] → [specific issue]", max ~14 words */
	text: z.string(),
})

/** Chain: a connective/reasoning phrase highlighted on the scan */
export const ChainPayloadSchema = z.object({
	_v: z.literal(1),
	chainType: z.enum(["reasoning", "evaluation", "judgement"]),
	/** The trigger phrase matched in the student's text */
	phrase: z.string(),
})

// ============================================
// INFERRED TYPES
// ============================================

export type MarkPayload = z.infer<typeof MarkPayloadSchema>
export type TagPayload = z.infer<typeof TagPayloadSchema>
export type CommentPayload = z.infer<typeof CommentPayloadSchema>
export type ChainPayload = z.infer<typeof ChainPayloadSchema>

export type AnnotationPayload =
	| MarkPayload
	| TagPayload
	| CommentPayload
	| ChainPayload

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
): AnnotationPayload {
	switch (overlayType) {
		case "mark":
			return MarkPayloadSchema.parse(raw)
		case "tag":
			return TagPayloadSchema.parse(raw)
		case "comment":
			return CommentPayloadSchema.parse(raw)
		case "chain":
			return ChainPayloadSchema.parse(raw)
	}
}

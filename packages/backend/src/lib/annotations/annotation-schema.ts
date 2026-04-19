import { MARK_SIGNAL_NAMES } from "@mcp-gcse/shared"
import { z } from "zod/v4"

/**
 * Zod schema for the Gemini structured output when generating annotations
 * for a single question's student answer.
 *
 * Flat model: each item is either a signal annotation or a chain — no
 * parent_index linking. AO tags and comments are fields on the annotation.
 */
export const AnnotationPlanItemSchema = z.object({
	anchor_start: z
		.number()
		.describe(
			"Start token index as an integer (0-based, inclusive) from the OCR token array",
		),
	anchor_end: z
		.number()
		.describe(
			"End token index as an integer (0-based, inclusive) from the OCR token array",
		),
	sentiment: z
		.enum(["positive", "negative", "neutral"])
		.describe("Sentiment for color coding"),

	// ── Signal annotation fields ────────────────────────────────────────────
	signal: z
		.enum(MARK_SIGNAL_NAMES)
		.optional()
		.describe(
			"Required for signal annotations. The physical signal type (tick, cross, underline, etc.).",
		),
	reason: z
		.string()
		.optional()
		.describe(
			"Required for signal annotations. Short examiner-style note (max ~10 words) explaining what this mark refers to.",
		),
	label: z
		.string()
		.optional()
		.describe("Optional short label for annotations, e.g. '3/4', 'vague'"),

	// ── AO tag fields (optional on signal annotations) ──────────────────────
	ao_category: z
		.string()
		.optional()
		.describe(
			"Optional AO skill category e.g. 'AO1', 'AO2', 'AO3'. Only on signal annotations.",
		),
	ao_quality: z
		.enum(["strong", "partial", "incorrect", "valid"])
		.optional()
		.describe(
			"Quality of the AO skill demonstration. Only when ao_category is set.",
		),

	// ── Comment field (optional on signal annotations) ───────────────────────
	comment: z
		.string()
		.optional()
		.describe(
			"Optional margin note. Format: '[diagnosis] → [specific issue]'. Max 8-14 words.",
		),

	// ── Chain fields ────────────────────────────────────────────────────────
	chain_type: z
		.enum(["reasoning", "evaluation", "judgement"])
		.optional()
		.describe("Required for chain annotations. The chain category."),
	trigger_phrase: z
		.string()
		.optional()
		.describe("Required for chain annotations. The connective phrase matched."),
})

export const AnnotationPlanSchema = z.object({
	annotations: z.array(AnnotationPlanItemSchema),
})

export type AnnotationPlanItem = z.infer<typeof AnnotationPlanItemSchema>
export type AnnotationPlan = z.infer<typeof AnnotationPlanSchema>

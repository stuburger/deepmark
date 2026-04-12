import { z } from "zod/v4"

/**
 * Zod schema for the Gemini structured output when generating annotations
 * for a single question's student answer.
 */
export const AnnotationPlanItemSchema = z.object({
	overlay_type: z
		.enum(["mark", "tag", "comment", "chain"])
		.describe("The annotation overlay type"),
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

	// Mark fields
	signal: z
		.enum(["tick", "cross", "underline", "double_underline", "box", "circle"])
		.optional()
		.describe("Required for overlay_type=mark. The physical signal type."),
	label: z
		.string()
		.optional()
		.describe("Optional short label for marks, e.g. 'AO1', 'vague'"),
	reason: z
		.string()
		.optional()
		.describe(
			"Required for overlay_type=mark and overlay_type=tag. Short examiner-style note (max ~10 words) explaining what this mark refers to. For marks: which mark point or skill. For tags: what skill was demonstrated.",
		),

	// Tag fields
	category: z
		.string()
		.optional()
		.describe(
			"Required for overlay_type=tag. Skill category e.g. 'AO1', 'AO2', 'AO3'",
		),
	awarded: z
		.boolean()
		.optional()
		.describe(
			"Required for overlay_type=tag. Whether the skill was demonstrated.",
		),
	quality: z
		.enum(["strong", "partial", "incorrect", "valid"])
		.optional()
		.describe(
			"Required for overlay_type=tag. Quality of the skill demonstration.",
		),

	// Comment fields
	comment_text: z
		.string()
		.optional()
		.describe(
			"Required for overlay_type=comment. Format: '[diagnosis] → [specific issue]'. Max ~14 words.",
		),

	// Chain fields
	chain_type: z
		.enum(["reasoning", "evaluation", "judgement"])
		.optional()
		.describe("Required for overlay_type=chain. The chain category."),
	trigger_phrase: z
		.string()
		.optional()
		.describe(
			"Required for overlay_type=chain. The connective phrase matched.",
		),

	// Parent linking
	parent_index: z
		.number()
		.optional()
		.describe(
			"For tag/comment: index of the parent mark annotation in this array",
		),
})

export const AnnotationPlanSchema = z.object({
	annotations: z.array(AnnotationPlanItemSchema),
})

export type AnnotationPlanItem = z.infer<typeof AnnotationPlanItemSchema>
export type AnnotationPlan = z.infer<typeof AnnotationPlanSchema>

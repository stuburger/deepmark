import { z } from "zod"
import type { MarkSchemeInput } from "./types"

// Mark-point shape used inside `point_based` mark schemes. Standalone export so
// other schemas (and tests) can compose it.
export const markSchemePointSchema = z.object({
	criteria: z.string().trim().min(1, "Mark point criteria is required"),
	description: z.string().optional(),
	points: z.number().int().min(0, "Mark point value is invalid"),
})

// Single source of truth for mark-scheme input validation. Used by the
// `createMarkScheme` / `updateMarkScheme` actions for DB writes and by
// `evaluateStudentAnswer` to validate the in-flight `markSchemeDraft` field.
//
// Each branch is a "loose superset": the discriminator + that method's required
// fields plus `optional()` versions of the other branches' fields. This lets
// the form payload (which sometimes carries fields irrelevant to the chosen
// method) round-trip without rejection — narrowing in handlers happens via the
// discriminator.
export const markSchemeInputSchema = z.discriminatedUnion("marking_method", [
	z.object({
		marking_method: z.literal("deterministic"),
		description: z.string().trim().min(1, "Description is required"),
		guidance: z.string().trim().nullable().optional(),
		correct_option_labels: z
			.array(z.string())
			.min(1, "Select at least one correct answer"),
		mark_points: z.array(markSchemePointSchema).optional().default([]),
		points_total: z.number().nullish(),
		content: z.string().nullish(),
	}),
	z.object({
		marking_method: z.literal("point_based"),
		description: z.string().trim().min(1, "Description is required"),
		guidance: z.string().trim().nullable().optional(),
		mark_points: z
			.array(markSchemePointSchema)
			.min(1, "At least one mark point is required"),
		correct_option_labels: z.array(z.string()).optional().default([]),
		points_total: z.number().nullish(),
		content: z.string().nullish(),
	}),
	z.object({
		marking_method: z.literal("level_of_response"),
		description: z.string().trim().min(1, "Description is required"),
		guidance: z.string().trim().nullable().optional(),
		content: z.string().trim().min(1, "Mark scheme content is required"),
		points_total: z.number().int().positive("Cannot determine total marks"),
		mark_points: z.array(markSchemePointSchema).optional().default([]),
		correct_option_labels: z.array(z.string()).optional().default([]),
	}),
]) satisfies z.ZodType<MarkSchemeInput>

export type MarkSchemeInputParsed = z.infer<typeof markSchemeInputSchema>

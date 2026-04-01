import { z } from "zod"
import type { GcseMarkPoint, MarkingRules } from "./grader"

// ============================================
// PRISMA HELPERS
// ============================================

const markPointPrismaSchema = z.object({
	point_number: z.number(),
	description: z.string(),
	points: z.number(),
	criteria: z.string(),
})

/**
 * Parse Prisma mark_points JSON into GcseMarkPoint[]. isRequired defaults to false.
 */
export function parseMarkPointsFromPrisma(json: unknown): GcseMarkPoint[] {
	const arr = z.array(markPointPrismaSchema).parse(json)
	return arr.map((mp) => ({
		pointNumber: mp.point_number,
		description: mp.description,
		points: mp.points,
		criteria: mp.criteria,
		isRequired: false,
	}))
}

const markingRulesLevelSchema = z.object({
	level: z.number(),
	mark_range: z.tuple([z.number(), z.number()]),
	descriptor: z.string(),
	ao_requirements: z.array(z.string()).nullish(),
})

const markingRulesCapSchema = z.object({
	condition: z.string(),
	max_level: z.number().optional(),
	max_mark: z.number().optional(),
	reason: z.string(),
})

const markingRulesPrismaSchema = z.object({
	command_word: z.string().optional(),
	items_required: z.number().nullish(),
	levels: z.array(markingRulesLevelSchema),
	caps: z.array(markingRulesCapSchema).optional(),
})

/**
 * Parse Prisma marking_rules JSON into MarkingRules, or null if invalid/empty.
 */
export function parseMarkingRulesFromPrisma(
	json: unknown,
): MarkingRules | null {
	if (json == null) return null
	const result = markingRulesPrismaSchema.safeParse(json)
	return result.success ? result.data : null
}

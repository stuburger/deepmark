import { z } from "zod/v4"
import type { GcseMarkPoint } from "./types"

// ============================================
// PRISMA JSON → DOMAIN TYPE PARSERS
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

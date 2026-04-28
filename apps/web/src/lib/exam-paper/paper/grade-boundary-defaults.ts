import type { Prisma, TierLevel } from "@mcp-gcse/db"
import { getTypicalBoundaries, isTieredSubject } from "@mcp-gcse/shared"

function defaultTierForTypicalBoundaries(
	subject: string,
	tier: TierLevel | null | undefined,
): TierLevel | null {
	if (tier) return tier
	return isTieredSubject(subject) ? "higher" : null
}

export function typicalGradeBoundaryCreateData(
	subject: string,
	tier: TierLevel | null | undefined,
): Pick<
	Prisma.ExamPaperCreateInput,
	"tier" | "grade_boundaries" | "grade_boundary_mode"
> {
	const resolvedTier = defaultTierForTypicalBoundaries(subject, tier)
	const boundaries = getTypicalBoundaries(subject, resolvedTier)

	return {
		tier: resolvedTier,
		grade_boundaries: boundaries ?? undefined,
		grade_boundary_mode: boundaries ? "percent" : undefined,
	}
}

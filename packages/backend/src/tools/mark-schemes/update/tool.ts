import { db } from "@/db"
import { tool } from "@/tools/shared/tool-utils"
import type { MarkScheme } from "@mcp-gcse/db"
import { UpdateMarkSchemeSchema } from "./schema"

export const handler = tool(UpdateMarkSchemeSchema, async (args) => {
	const { id, points_total, mark_points, marking_method, marking_rules } = args

	console.log("[update-mark-scheme] Handler invoked", {
		id,
		points_total,
		marking_method,
	})

	// Check if the mark scheme exists
	const mark_scheme = await db.markScheme.findUniqueOrThrow({
		where: { id },
		include: { marking_results: true },
	})

	if (mark_scheme.marking_results.length > 0) {
		throw new Error("Cannot update a mark scheme that has already been used")
	}
	// Prepare update data
	const updateData: Partial<MarkScheme> = {}

	// Add optional fields if provided
	if (points_total !== undefined) {
		updateData.points_total = points_total
	}

	if (mark_points !== undefined) {
		updateData.mark_points = mark_points
	}

	if (marking_method !== undefined) {
		updateData.marking_method = marking_method
	}

	if (marking_rules !== undefined) {
		updateData.marking_rules = marking_rules
	}

	const effectiveMethod =
		marking_method ?? mark_scheme.marking_method ?? "point_based"
	const effectivePointsTotal = points_total ?? mark_scheme.points_total
	const effectiveMarkPoints =
		mark_points ?? (mark_scheme.mark_points as typeof mark_points)

	console.log("[update-mark-scheme] Validating update data", {
		id,
		points_total,
		mark_pointsLength: mark_points?.length,
		marking_method: effectiveMethod,
	})

	// Method-aware validation
	if (effectiveMethod === "point_based") {
		// Point-based: each mark point is 1 point; count must match total
		if (effectiveMarkPoints && Array.isArray(effectiveMarkPoints)) {
			if (effectiveMarkPoints.length !== effectivePointsTotal) {
				throw new Error(
					`Validation error (point_based): Number of mark points (${effectiveMarkPoints.length}) does not match points total (${effectivePointsTotal}).`,
				)
			}
			const invalidPoints = effectiveMarkPoints.filter(
				(point) => point.points !== 1,
			)
			if (invalidPoints.length > 0) {
				throw new Error(
					`Validation error (point_based): All mark points must have points value of 1. Found ${invalidPoints.length} invalid.`,
				)
			}
		} else if (points_total !== undefined && mark_points === undefined) {
			const existing = mark_scheme.mark_points
			const len = Array.isArray(existing) ? existing.length : 0
			if (points_total !== len) {
				throw new Error(
					`Validation error (point_based): Points total (${points_total}) does not match existing number of mark points (${len}).`,
				)
			}
		}
	} else if (effectiveMethod === "level_of_response") {
		// LoR: mark_points can represent levels; total can come from highest mark_range
		if (effectiveMarkPoints && Array.isArray(effectiveMarkPoints)) {
			const maxMark = effectiveMarkPoints.reduce(
				(max, p) => Math.max(max, typeof p.points === "number" ? p.points : 0),
				0,
			)
			if (points_total !== undefined && points_total < maxMark) {
				throw new Error(
					`Validation error (level_of_response): points_total (${points_total}) should be at least the maximum mark from mark points (${maxMark}).`,
				)
			}
		}
	}
	// deterministic: no mark_points required; skip strict validation

	console.log("[update-mark-scheme] Updating mark scheme", { id, updateData })

	// Update the mark scheme in the database
	const updatedMarkScheme = await db.markScheme.update({
		where: { id },
		data: updateData,
	})

	console.log("[update-mark-scheme] Mark scheme updated successfully", {
		id,
	})

	return `
Mark scheme updated successfully! 
Mark Scheme ID: ${id}
Updated Fields: ${Object.keys(updateData)
		.filter((key) => key !== "updated_at")
		.join(", ")}
Question ID: ${updatedMarkScheme.question_id}
Total Points: ${updatedMarkScheme.points_total}
Number of Mark Points: ${Array.isArray(updatedMarkScheme.mark_points) ? updatedMarkScheme.mark_points.length : 0}`
})

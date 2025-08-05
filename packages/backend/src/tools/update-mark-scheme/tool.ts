import { UpdateMarkSchemeSchema } from "./schema"
import { tool } from "../shared/tool-utils"
import { db } from "@/db"
import type { MarkScheme } from "@/generated/prisma"

export const handler = tool(UpdateMarkSchemeSchema, async (args) => {
	const { id, points_total, mark_points } = args

	console.log("[update-mark-scheme] Handler invoked", { id, points_total })

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

	console.log("[update-mark-scheme] Validating update data", {
		id,
		points_total,
		mark_pointsLength: mark_points?.length,
	})

	// Validate points consistency if both fields are being updated
	if (points_total !== undefined && mark_points !== undefined) {
		// Validate that mark_points length matches points_total
		if (mark_points.length !== points_total) {
			console.log("[update-mark-scheme] Validation error: points mismatch", {
				markPointsLength: mark_points.length,
				pointsTotal: points_total,
			})

			throw new Error(
				`Validation error: Number of mark points (${mark_points.length}) does not match points total (${points_total}).`,
			)
		}

		// Validate that all mark points have points value of 1
		const invalidPoints = mark_points.filter((point) => point.points !== 1)

		if (invalidPoints.length > 0) {
			throw new Error(
				`Validation error: All mark points must have a points value of 1. Found ${invalidPoints.length} invalid mark points.`,
			)
		}
	}

	// If only mark_points is being updated, validate against existing points_total
	if (mark_points !== undefined && points_total === undefined) {
		if (mark_points.length !== mark_scheme.points_total) {
			throw new Error(
				`Validation error: Number of mark points (${mark_points.length}) does not match existing points total (${mark_scheme.points_total}).`,
			)
		}

		// Validate that all mark points have points value of 1
		const invalidPoints = mark_points.filter((point) => point.points !== 1)
		if (invalidPoints.length > 0) {
			throw new Error(
				`Validation error: All mark points must have a points value of 1. Found ${invalidPoints.length} invalid mark points.`,
			)
		}
	}

	// If only points_total is being updated, validate against existing mark_points
	if (points_total !== undefined && mark_points === undefined) {
		if (points_total !== mark_scheme.mark_points.length) {
			throw new Error(
				`Validation error: Points total (${points_total}) does not match existing number of mark points (${mark_scheme.mark_points.length}).`,
			)
		}
	}

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
Number of Mark Points: ${updatedMarkScheme.mark_points.length}`
})

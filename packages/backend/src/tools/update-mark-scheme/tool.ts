import { UpdateMarkSchemeSchema } from "./schema"
import { ObjectId } from "mongodb"
import { tool, text } from "../tool-utils"
import { db } from "@/db"
import { MarkScheme } from "@/generated/prisma"

export const handler = tool(UpdateMarkSchemeSchema, async (args) => {
	const { id, points_total, mark_points } = args

	console.log("[update-mark-scheme] Handler invoked", { id, points_total })

	// Check if the mark scheme exists
	const existingMarkScheme = await db.markScheme.findUniqueOrThrow({
		where: { id },
    include: { question: { include: { answers: true }}}
	})

	if (!existingMarkScheme) {
		console.log(`[update-mark-scheme] Mark scheme not found: ${id}`)
		throw new Error(`Mark scheme with ID ${id} not found.`)
	}

  if(mark)
	// Prepare update data
	const updateData: Partial<MarkScheme> = {
		updated_at: new Date(),
	}

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
			return text(
				`Validation error: Number of mark points (${mark_points.length}) does not match points total (${points_total}).`,
			)
		}

		// Validate that all mark points have points value of 1
		const invalidPoints = mark_points.filter((point) => point.points !== 1)
		if (invalidPoints.length > 0) {
			console.log(
				"[update-mark-scheme] Validation error: invalid points values",
				{
					invalidPointsCount: invalidPoints.length,
				},
			)
			return text(
				`Validation error: All mark points must have a points value of 1. Found ${invalidPoints.length} invalid mark points.`,
			)
		}
	}

	// If only mark_points is being updated, validate against existing points_total
	if (mark_points !== undefined && points_total === undefined) {
		if (mark_points.length !== existingMarkScheme.points_total) {
			console.log(
				"[update-mark-scheme] Validation error: mark points mismatch with existing",
				{
					markPointsLength: mark_points.length,
					existingPointsTotal: existingMarkScheme.points_total,
				},
			)
			return text(
				`Validation error: Number of mark points (${mark_points.length}) does not match existing points total (${existingMarkScheme.points_total}).`,
			)
		}

		// Validate that all mark points have points value of 1
		const invalidPoints = mark_points.filter((point) => point.points !== 1)
		if (invalidPoints.length > 0) {
			console.log(
				"[update-mark-scheme] Validation error: invalid points values",
				{
					invalidPointsCount: invalidPoints.length,
				},
			)
			return text(
				`Validation error: All mark points must have a points value of 1. Found ${invalidPoints.length} invalid mark points.`,
			)
		}
	}

	// If only points_total is being updated, validate against existing mark_points
	if (points_total !== undefined && mark_points === undefined) {
		if (points_total !== existingMarkScheme.mark_points.length) {
			console.log(
				"[update-mark-scheme] Validation error: points total mismatch with existing",
				{
					pointsTotal: points_total,
					existingMarkPointsLength: existingMarkScheme.mark_points.length,
				},
			)
			return text(
				`Validation error: Points total (${points_total}) does not match existing number of mark points (${existingMarkScheme.mark_points.length}).`,
			)
		}
	}

	console.log("[update-mark-scheme] Updating mark scheme", { id, updateData })

	// Update the mark scheme in the database
	const result = await mark_schemes.updateOne(
		{ _id: new ObjectId(id) },
		{ $set: updateData },
	)

	if (result.matchedCount === 0) {
		console.log(
			`[update-mark-scheme] Mark scheme not found during update: ${id}`,
		)
		return text(`Mark scheme with ID ${id} not found.`)
	}

	if (result.modifiedCount === 0) {
		console.log(`[update-mark-scheme] No changes made to mark scheme: ${id}`)
		return text(`Mark scheme with ID ${id} was found but no changes were made.`)
	}

	// Get the updated mark scheme for response
	const updatedMarkScheme = await mark_schemes.findOne({
		_id: new ObjectId(id),
	})

	console.log("[update-mark-scheme] Mark scheme updated successfully", {
		id,
		modifiedCount: result.modifiedCount,
	})

	return text(
		`Mark scheme updated successfully! Mark Scheme ID: ${id}\n\nUpdated Fields: ${Object.keys(
			updateData,
		)
			.filter((key) => key !== "updated_at")
			.join(", ")}\nQuestion ID: ${
			updatedMarkScheme?.question_id
		}\nTotal Points: ${
			updatedMarkScheme?.points_total
		}\nNumber of Mark Points: ${updatedMarkScheme?.mark_points.length}`,
	)
})

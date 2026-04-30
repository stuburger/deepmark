"use server"

import { resourceAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { z } from "zod"
import type { MarkSchemeInput } from "./types"

export type { MarkSchemeInput, MarkSchemePointInput } from "./types"

const markSchemePointSchema = z.object({
	criteria: z.string(),
	description: z.string().optional(),
	points: z.number().int().min(0),
})

const markSchemeInputSchema = z.discriminatedUnion("marking_method", [
	z.object({
		marking_method: z.literal("deterministic"),
		description: z.string().trim().min(1, "Description is required"),
		guidance: z.string().optional(),
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
		guidance: z.string().optional(),
		mark_points: z.array(markSchemePointSchema).min(1),
		correct_option_labels: z.array(z.string()).optional().default([]),
		points_total: z.number().nullish(),
		content: z.string().nullish(),
	}),
	z.object({
		marking_method: z.literal("level_of_response"),
		description: z.string().trim().min(1, "Description is required"),
		guidance: z.string().optional(),
		content: z.string().trim().min(1, "Mark scheme content is required"),
		points_total: z.number().int().positive(),
		mark_points: z.array(markSchemePointSchema).optional().default([]),
		correct_option_labels: z.array(z.string()).optional().default([]),
	}),
]) satisfies z.ZodType<MarkSchemeInput>

// ─── Create ───────────────────────────────────────────────────────────────────

export const createMarkScheme = resourceAction({
	type: "question",
	role: "editor",
	schema: z.object({
		questionId: z.string(),
		input: markSchemeInputSchema,
	}),
	id: ({ questionId }) => questionId,
}).action(
	async ({
		parsedInput: { questionId, input },
		ctx,
	}): Promise<{ id: string }> => {
		const isDeterministic = input.marking_method === "deterministic"
		const isPointBased = input.marking_method === "point_based"
		const isLevelOfResponse = input.marking_method === "level_of_response"

		let pointsTotal: number
		if (isDeterministic) {
			pointsTotal = 1
		} else if (isPointBased) {
			pointsTotal = input.mark_points.reduce((sum, mp) => sum + mp.points, 0)
		} else {
			pointsTotal = input.points_total ?? 0
			if (pointsTotal <= 0) throw new Error("Cannot determine total marks")
		}

		const markPoints = isPointBased
			? input.mark_points.map((mp, i) => ({
					point_number: i + 1,
					criteria: mp.criteria,
					description: mp.description ?? "",
					points: mp.points,
				}))
			: []
		const correctOptionLabels = isDeterministic
			? input.correct_option_labels
			: []

		const ms = await db.markScheme.create({
			data: {
				question_id: questionId,
				description: input.description,
				guidance: input.guidance?.trim() || null,
				points_total: pointsTotal,
				mark_points: markPoints,
				marking_method: input.marking_method,
				...(isLevelOfResponse ? { content: input.content ?? "" } : {}),
				correct_option_labels: correctOptionLabels,
				link_status: "linked",
				created_by_id: ctx.user.id,
			},
			select: { id: true },
		})

		ctx.log.info("Mark scheme created manually", {
			questionId,
			markSchemeId: ms.id,
			markingMethod: input.marking_method,
		})

		return { id: ms.id }
	},
)

// ─── Update ───────────────────────────────────────────────────────────────────

export const updateMarkScheme = resourceAction({
	type: "markScheme",
	role: "editor",
	schema: z.object({
		markSchemeId: z.string(),
		input: markSchemeInputSchema,
	}),
	id: ({ markSchemeId }) => markSchemeId,
}).action(
	async ({
		parsedInput: { markSchemeId, input },
		ctx,
	}): Promise<{ ok: true }> => {
		const existing = await db.markScheme.findUnique({
			where: { id: markSchemeId },
			select: { marking_method: true, mark_points: true },
		})
		if (!existing) throw new Error("Mark scheme not found")

		if (existing.marking_method !== input.marking_method) {
			throw new Error("Invalid update payload for mark scheme type")
		}

		const isDeterministic = existing.marking_method === "deterministic"
		const isPointBased = existing.marking_method === "point_based"
		const isLevelOfResponse = existing.marking_method === "level_of_response"

		let pointsTotal: number | null = null
		if (isPointBased && input.marking_method === "point_based") {
			pointsTotal = input.mark_points.reduce((sum, mp) => sum + mp.points, 0)
		} else if (
			isLevelOfResponse &&
			input.marking_method === "level_of_response"
		) {
			pointsTotal = input.points_total
		}

		// See pre-migration commit history for the rationale on positional
		// description preservation when a mark point's `description` is
		// undefined in the form payload.
		const existingMarkPoints = Array.isArray(existing.mark_points)
			? (existing.mark_points as Array<{ description?: string }>)
			: []
		const markPoints =
			isPointBased && input.marking_method === "point_based"
				? input.mark_points.map((mp, i) => ({
						point_number: i + 1,
						criteria: mp.criteria,
						description:
							mp.description !== undefined
								? mp.description
								: (existingMarkPoints[i]?.description ?? ""),
						points: mp.points,
					}))
				: null

		await db.markScheme.update({
			where: { id: markSchemeId },
			data: {
				description: input.description,
				guidance: input.guidance?.trim() || null,
				...(isPointBased && pointsTotal !== null && markPoints !== null
					? {
							points_total: pointsTotal,
							mark_points: markPoints,
						}
					: {}),
				...(isLevelOfResponse &&
				input.marking_method === "level_of_response" &&
				pointsTotal !== null
					? {
							points_total: pointsTotal,
							content: input.content ?? "",
						}
					: {}),
				...(isDeterministic && input.marking_method === "deterministic"
					? { correct_option_labels: input.correct_option_labels }
					: {}),
			},
		})

		ctx.log.info("Mark scheme updated manually", {
			markSchemeId,
			markingMethod: existing.marking_method,
		})

		return { ok: true }
	},
)

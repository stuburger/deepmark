"use server"

import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../auth"
import { log } from "../logger"

const TAG = "mark-scheme/manual"
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

import type { MarkSchemeInput } from "./types"
export type {
	MarkSchemeInput,
	MarkSchemePointInput,
	MarkingRulesCapInput,
	MarkingRulesInput,
	MarkingRulesLevelInput,
} from "./types"

// ─── Create ───────────────────────────────────────────────────────────────────

export type CreateMarkSchemeResult =
	| { ok: true; id: string }
	| { ok: false; error: string }

export async function createMarkScheme(
	questionId: string,
	input: MarkSchemeInput,
): Promise<CreateMarkSchemeResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const description = input.description.trim()
	if (!description) return { ok: false, error: "Description is required" }

	if (
		input.marking_method === "deterministic" &&
		input.correct_option_labels.length === 0
	) {
		return { ok: false, error: "Select at least one correct answer" }
	}
	if (
		input.marking_method === "level_of_response" &&
		input.marking_rules.levels.length === 0
	) {
		return { ok: false, error: "At least one level descriptor is required" }
	}

	const isDeterministic = input.marking_method === "deterministic"
	const isPointBased = input.marking_method === "point_based"
	const isLevelOfResponse = input.marking_method === "level_of_response"
	const pointsTotal = isDeterministic
		? 1
		: isPointBased
			? input.mark_points.reduce((sum, mp) => sum + mp.points, 0)
			: Math.max(...input.marking_rules.levels.map((l) => l.mark_range[1]))
	const markPoints = isPointBased
		? input.mark_points.map((mp, i) => ({
				point_number: i + 1,
				description: mp.description,
				points: mp.points,
			}))
		: []
	const correctOptionLabels = isDeterministic ? input.correct_option_labels : []

	try {
		const ms = await db.markScheme.create({
			data: {
				question_id: questionId,
				description,
				guidance: input.guidance?.trim() || null,
				points_total: pointsTotal,
				mark_points: markPoints,
				marking_method: input.marking_method,
				...(isLevelOfResponse ? { marking_rules: input.marking_rules } : {}),
				correct_option_labels: correctOptionLabels,
				link_status: "linked",
				created_by_id: session.userId,
			},
			select: { id: true },
		})

		log.info(TAG, "Mark scheme created manually", {
			userId: session.userId,
			questionId,
			markSchemeId: ms.id,
			markingMethod: input.marking_method,
		})

		return { ok: true, id: ms.id }
	} catch (err) {
		log.error(TAG, "createMarkScheme failed", {
			userId: session.userId,
			questionId,
			error: String(err),
		})
		return { ok: false, error: "Failed to create mark scheme" }
	}
}

// ─── Update ───────────────────────────────────────────────────────────────────

export type UpdateMarkSchemeResult = { ok: true } | { ok: false; error: string }

export async function updateMarkScheme(
	markSchemeId: string,
	input: MarkSchemeInput,
): Promise<UpdateMarkSchemeResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const description = input.description.trim()
	if (!description) return { ok: false, error: "Description is required" }

	try {
		const existing = await db.markScheme.findUnique({
			where: { id: markSchemeId },
			select: { marking_method: true },
		})
		if (!existing) return { ok: false, error: "Mark scheme not found" }

		const isDeterministic = existing.marking_method === "deterministic"
		const isPointBased = existing.marking_method === "point_based"
		const isLevelOfResponse = existing.marking_method === "level_of_response"

		if (isDeterministic && input.marking_method !== "deterministic") {
			return { ok: false, error: "Invalid update payload for mark scheme type" }
		}
		if (isPointBased && input.marking_method !== "point_based") {
			return { ok: false, error: "Invalid update payload for mark scheme type" }
		}
		if (isLevelOfResponse && input.marking_method !== "level_of_response") {
			return { ok: false, error: "Invalid update payload for mark scheme type" }
		}
		if (
			isDeterministic &&
			input.marking_method === "deterministic" &&
			input.correct_option_labels.length === 0
		) {
			return { ok: false, error: "Select at least one correct answer" }
		}
		if (
			isLevelOfResponse &&
			input.marking_method === "level_of_response" &&
			input.marking_rules.levels.length === 0
		) {
			return { ok: false, error: "At least one level descriptor is required" }
		}

		const pointsTotal = isPointBased
			? input.marking_method === "point_based"
				? input.mark_points.reduce((sum, mp) => sum + mp.points, 0)
				: 0
			: isLevelOfResponse && input.marking_method === "level_of_response"
				? Math.max(...input.marking_rules.levels.map((l) => l.mark_range[1]))
				: null
		const markPoints =
			isPointBased && input.marking_method === "point_based"
				? input.mark_points.map((mp, i) => ({
						point_number: i + 1,
						description: mp.description,
						points: mp.points,
					}))
				: null

		await db.markScheme.update({
			where: { id: markSchemeId },
			data: {
				description,
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
							marking_rules: input.marking_rules,
						}
					: {}),
				...(isDeterministic && input.marking_method === "deterministic"
					? { correct_option_labels: input.correct_option_labels }
					: {}),
			},
		})

		log.info(TAG, "Mark scheme updated manually", {
			userId: session.userId,
			markSchemeId,
			markingMethod: existing.marking_method,
		})

		return { ok: true }
	} catch (err) {
		log.error(TAG, "updateMarkScheme failed", {
			userId: session.userId,
			markSchemeId,
			error: String(err),
		})
		return { ok: false, error: "Failed to update mark scheme" }
	}
}

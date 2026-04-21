"use server"

import { db } from "@/lib/db"
import { auth } from "../auth"
import { log } from "../logger"

const TAG = "mark-scheme/manual"

import type { MarkSchemeInput } from "./types"
export type { MarkSchemeInput, MarkSchemePointInput } from "./types"

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
	if (input.marking_method === "level_of_response" && !input.content?.trim()) {
		return { ok: false, error: "Mark scheme content is required" }
	}

	const isDeterministic = input.marking_method === "deterministic"
	const isPointBased = input.marking_method === "point_based"
	const isLevelOfResponse = input.marking_method === "level_of_response"

	let pointsTotal: number
	if (isDeterministic) {
		pointsTotal = 1
	} else if (isPointBased) {
		pointsTotal = input.mark_points.reduce((sum, mp) => sum + mp.points, 0)
	} else if (input.points_total != null && input.points_total > 0) {
		pointsTotal = input.points_total
	} else {
		return { ok: false, error: "Cannot determine total marks" }
	}
	// `criteria` is the grading-meaningful field; `description` is optional
	// teacher-authored metadata (category, AO, marker note). Both persist on
	// every row; description is "" when not supplied.
	const markPoints = isPointBased
		? input.mark_points.map((mp, i) => ({
				point_number: i + 1,
				criteria: mp.criteria,
				description: mp.description ?? "",
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
				...(isLevelOfResponse ? { content: input.content ?? "" } : {}),
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
			select: { marking_method: true, mark_points: true },
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
			!input.content?.trim()
		) {
			return { ok: false, error: "Mark scheme content is required" }
		}

		let pointsTotal: number | null = null
		if (isPointBased && input.marking_method === "point_based") {
			pointsTotal = input.mark_points.reduce((sum, mp) => sum + mp.points, 0)
		} else if (
			isLevelOfResponse &&
			input.marking_method === "level_of_response"
		) {
			if (input.points_total != null && input.points_total > 0) {
				pointsTotal = input.points_total
			} else {
				return { ok: false, error: "Cannot determine total marks" }
			}
		}
		// Preserve existing `description` by position when the form doesn't
		// carry one (older callers, autofill). Mark points have no stable ID
		// today — `point_number` is assigned from array position on every
		// save — so this is positional, not identity-based. Reordering mark
		// points in the UI will therefore shuffle descriptions along with
		// them, which matches how the criteria field behaves. If we ever
		// want reorder-safe description preservation, each mark point needs
		// a real ID on the row.
		//
		// Three cases covered:
		//   1. Form explicitly sets a description → use it.
		//   2. Form leaves description undefined → preserve DB value at
		//      that position.
		//   3. Form clears description to "" → save the empty (intentional
		//      wipe).
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
							content: input.content ?? "",
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

"use server"

import { withSubmissionEditor } from "@/lib/collab/headless-edit"
import {
	setQuestionFeedbackBullets,
	setTeacherOverride,
} from "@mcp-gcse/shared"
import { auth } from "../../auth"
import type {
	DeleteTeacherOverrideResult,
	UpsertTeacherOverrideInput,
	UpsertTeacherOverrideResult,
} from "../types"

export type SaveFeedbackBulletsResult =
	| { ok: true }
	| { ok: false; error: string }

/**
 * Write a teacher score / feedback override for one question of a
 * submission. The Y.Doc is the source of truth — this server action
 * opens a HeadlessEditor session, dispatches the new attrs onto the
 * matching `questionAnswer` block (or `mcqTable.results[i]` row), and
 * the projection Lambda picks up the change on the next snapshot to
 * mirror it onto the `TeacherOverride` table for analytics consumers.
 *
 * No direct PG write happens here. The optimistic `TeacherOverride`
 * row the caller's React Query cache shows is the projection lag (~2s)
 * — UI stays consistent because the same teacher is also reading from
 * the doc via the live Hocuspocus connection (the dispatch is broadcast
 * back to their own browser through the collab-server).
 */
export async function upsertTeacherOverride(
	submissionId: string,
	questionId: string,
	input: UpsertTeacherOverrideInput,
): Promise<UpsertTeacherOverrideResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	if (input.score_override < 0)
		return { ok: false, error: "Score cannot be negative" }

	const reason = input.reason?.trim() || null
	const feedbackOverride = input.feedback_override ?? null
	const setAt = new Date()

	try {
		await withSubmissionEditor(submissionId, (view) =>
			setTeacherOverride(
				view,
				questionId,
				{
					score: input.score_override,
					reason,
					feedback: feedbackOverride,
					setBy: session.userId,
					setAt: setAt.toISOString(),
				},
				feedbackOverride,
			),
		)
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		}
	}

	return {
		ok: true,
		override: {
			// Synthesised from the dispatched payload — there's no PG row to
			// echo back yet (projection lands within ~2s). React Query consumers
			// can use this for their optimistic cache; the eventual refetch
			// gets the projected row.
			id: `pending-${submissionId}-${questionId}`,
			submission_id: submissionId,
			question_id: questionId,
			score_override: input.score_override,
			reason,
			feedback_override: feedbackOverride,
			created_at: setAt,
			updated_at: setAt,
		},
	}
}

/**
 * Replace the WWW (`whatWentWell`) and / or EBI (`evenBetterIf`) bullet
 * lists on a question's `questionAnswer` block. The teacher's edits become
 * the source of truth — there is no separate `*_override` field. AI grades
 * only re-write these via `setQuestionGrade`, which runs at original-grade
 * and re-grade time; re-grades create a new submission so teacher edits
 * on the prior submission are never clobbered.
 */
export async function saveQuestionFeedbackBullets(
	submissionId: string,
	questionId: string,
	patch: { whatWentWell?: string[]; evenBetterIf?: string[] },
): Promise<SaveFeedbackBulletsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	try {
		await withSubmissionEditor(submissionId, (view) =>
			setQuestionFeedbackBullets(view, questionId, patch),
		)
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		}
	}

	return { ok: true }
}

/**
 * Clear a teacher override. Dispatches `null` for both override attrs
 * onto the doc; the projection picks up the missing entry and deletes
 * the corresponding `TeacherOverride` row on the next snapshot.
 */
export async function deleteTeacherOverride(
	submissionId: string,
	questionId: string,
): Promise<DeleteTeacherOverrideResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	try {
		await withSubmissionEditor(submissionId, (view) =>
			setTeacherOverride(view, questionId, null, null),
		)
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		}
	}

	return { ok: true }
}

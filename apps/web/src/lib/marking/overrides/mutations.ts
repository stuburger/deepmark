"use server"

import { resourceAction } from "@/lib/authz"
import { withSubmissionEditor } from "@/lib/collab/headless-edit"
import {
	setQuestionFeedbackBullets,
	setTeacherOverride,
} from "@mcp-gcse/shared"
import { z } from "zod"
import type { TeacherOverride } from "../types"

const upsertOverrideInput = z.object({
	submissionId: z.string(),
	questionId: z.string(),
	input: z.object({
		score_override: z.number().int().min(0, "Score cannot be negative"),
		reason: z.string().nullable().optional(),
		feedback_override: z.string().nullable().optional(),
	}),
})

/**
 * Write a teacher score / feedback override for one question of a submission.
 * The Y.Doc is the source of truth — this server action opens a HeadlessEditor
 * session, dispatches the new attrs onto the matching `questionAnswer` block
 * (or `mcqTable.results[i]` row), and the projection Lambda picks up the
 * change on the next snapshot to mirror it onto the `TeacherOverride` table
 * for analytics consumers.
 */
export const upsertTeacherOverride = resourceAction({
	type: "submission",
	role: "editor",
	schema: upsertOverrideInput,
	id: ({ submissionId }) => submissionId,
}).action(
	async ({
		parsedInput: { submissionId, questionId, input },
		ctx,
	}): Promise<{ override: TeacherOverride }> => {
		const reason = input.reason?.trim() || null
		const feedbackOverride = input.feedback_override ?? null
		const setAt = new Date()

		await withSubmissionEditor(submissionId, (view) =>
			setTeacherOverride(
				view,
				questionId,
				{
					score: input.score_override,
					reason,
					feedback: feedbackOverride,
					setBy: ctx.user.id,
					setAt: setAt.toISOString(),
				},
				feedbackOverride,
			),
		)

		return {
			override: {
				// Synthesised from the dispatched payload — there's no PG row to
				// echo back yet (projection lands within ~2s).
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
	},
)

const bulletsInput = z.object({
	submissionId: z.string(),
	questionId: z.string(),
	patch: z.object({
		whatWentWell: z.array(z.string()).optional(),
		evenBetterIf: z.array(z.string()).optional(),
	}),
})

/**
 * Replace the WWW (`whatWentWell`) and / or EBI (`evenBetterIf`) bullet lists
 * on a question's `questionAnswer` block. The teacher's edits become the
 * source of truth — there is no separate `*_override` field.
 */
export const saveQuestionFeedbackBullets = resourceAction({
	type: "submission",
	role: "editor",
	schema: bulletsInput,
	id: ({ submissionId }) => submissionId,
}).action(
	async ({
		parsedInput: { submissionId, questionId, patch },
	}): Promise<{ ok: true }> => {
		await withSubmissionEditor(submissionId, (view) =>
			setQuestionFeedbackBullets(view, questionId, patch),
		)
		return { ok: true }
	},
)

/**
 * Clear a teacher override. Dispatches `null` for both override attrs onto
 * the doc; the projection picks up the missing entry and deletes the
 * corresponding `TeacherOverride` row on the next snapshot.
 */
export const deleteTeacherOverride = resourceAction({
	type: "submission",
	role: "editor",
	schema: z.object({
		submissionId: z.string(),
		questionId: z.string(),
	}),
	id: ({ submissionId }) => submissionId,
}).action(
	async ({
		parsedInput: { submissionId, questionId },
	}): Promise<{ ok: true }> => {
		await withSubmissionEditor(submissionId, (view) =>
			setTeacherOverride(view, questionId, null, null),
		)
		return { ok: true }
	},
)

"use server"

import { db } from "@/lib/db"
import { auth } from "../../auth"
import type {
	DeleteTeacherOverrideResult,
	UpsertTeacherOverrideInput,
	UpsertTeacherOverrideResult,
} from "../types"

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
	const feedbackOverride = input.feedback_override ?? undefined

	const override = await db.teacherOverride.upsert({
		where: {
			submission_id_question_id: {
				submission_id: submissionId,
				question_id: questionId,
			},
		},
		create: {
			submission_id: submissionId,
			question_id: questionId,
			score_override: input.score_override,
			reason,
			feedback_override: feedbackOverride,
			created_by: session.userId,
		},
		update: {
			score_override: input.score_override,
			reason,
			feedback_override: feedbackOverride,
		},
	})

	return {
		ok: true,
		override: {
			id: override.id,
			submission_id: override.submission_id,
			question_id: override.question_id,
			score_override: override.score_override,
			reason: override.reason,
			feedback_override: override.feedback_override,
			created_at: override.created_at,
			updated_at: override.updated_at,
		},
	}
}

export async function deleteTeacherOverride(
	submissionId: string,
	questionId: string,
): Promise<DeleteTeacherOverrideResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	await db.teacherOverride.deleteMany({
		where: {
			submission_id: submissionId,
			question_id: questionId,
		},
	})

	return { ok: true }
}

"use server"

import { resourceAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { redactName } from "@mcp-gcse/shared"
import { z } from "zod"
import type { SubmissionFeedback, SubmissionFeedbackRating } from "../types"
import { toSubmissionFeedback } from "./feedback-mapper"

/**
 * Associates a Student record with a submission so that graded answers
 * are subsequently written to the normalised Answer / MarkingResult tables.
 * Also syncs student_name from the Student record.
 */
export const linkStudentToJob = resourceAction({
	type: "submission",
	role: "editor",
	schema: z.object({ jobId: z.string(), studentId: z.string() }),
	id: ({ jobId }) => jobId,
}).action(
	async ({ parsedInput: { jobId, studentId }, ctx }): Promise<{ ok: true }> => {
		const [sub, student] = await Promise.all([
			db.studentSubmission.findFirst({
				where: { id: jobId },
				select: { id: true },
			}),
			db.student.findFirst({
				where: { id: studentId },
			}),
		])
		if (!sub) throw new Error("Job not found")
		if (!student) throw new Error("Student not found")

		await db.studentSubmission.update({
			where: { id: jobId },
			data: {
				student_id: studentId,
				student_name: redactName(student.name),
			},
		})

		ctx.log.info("Student linked to job", { jobId, studentId })
		return { ok: true }
	},
)

/**
 * Severs the Student↔Submission link. We also clear student_name because
 * its current value is the previously-linked student's redacted name —
 * leaving it would mislabel the script as the wrong student until OCR
 * re-runs or the teacher re-links.
 */
export const unlinkStudentFromJob = resourceAction({
	type: "submission",
	role: "editor",
	schema: z.object({ jobId: z.string() }),
	id: ({ jobId }) => jobId,
}).action(async ({ parsedInput: { jobId }, ctx }): Promise<{ ok: true }> => {
	const sub = await db.studentSubmission.findFirst({
		where: { id: jobId },
		select: { id: true },
	})
	if (!sub) throw new Error("Job not found")

	await db.studentSubmission.update({
		where: { id: jobId },
		data: { student_id: null, student_name: null },
	})

	ctx.log.info("Student unlinked from job", { jobId })
	return { ok: true }
})

export const confirmMarking = resourceAction({
	type: "submission",
	role: "editor",
	schema: z.object({ jobId: z.string(), confirmed: z.boolean() }),
	id: ({ jobId }) => jobId,
}).action(
	async ({ parsedInput: { jobId, confirmed }, ctx }): Promise<{ ok: true }> => {
		await db.studentSubmission.update({
			where: { id: jobId },
			data: confirmed
				? { confirmed_at: new Date(), confirmed_by: ctx.user.id }
				: { confirmed_at: null, confirmed_by: null },
		})
		ctx.log.info(
			confirmed ? "Submission confirmed" : "Submission unconfirmed",
			{ jobId },
		)
		return { ok: true }
	},
)

export const deleteSubmission = resourceAction({
	type: "submission",
	role: "owner",
	schema: z.object({ jobId: z.string() }),
	id: ({ jobId }) => jobId,
}).action(async ({ parsedInput: { jobId } }): Promise<{ ok: true }> => {
	const sub = await db.studentSubmission.findUnique({
		where: { id: jobId },
		select: { id: true },
	})

	if (!sub) throw new Error("Submission not found")

	await db.$transaction(async (tx) => {
		await tx.gradingRun.deleteMany({ where: { submission_id: jobId } })
		await tx.ocrRun.deleteMany({ where: { submission_id: jobId } })
		await tx.resourceGrant.deleteMany({
			where: { resource_type: "student_submission", resource_id: jobId },
		})
		await tx.studentSubmission.delete({ where: { id: jobId } })
	})

	return { ok: true }
})

/**
 * Edits a single answer in extracted_answers_raw by question number.
 * The change is persisted so that a subsequent re-mark uses the corrected text.
 */
export const updateExtractedAnswer = resourceAction({
	type: "submission",
	role: "editor",
	schema: z.object({
		jobId: z.string(),
		questionNumber: z.string(),
		newText: z.string(),
	}),
	id: ({ jobId }) => jobId,
}).action(
	async ({
		parsedInput: { jobId, questionNumber, newText },
	}): Promise<{ ok: true }> => {
		const sub = await db.studentSubmission.findFirst({
			where: { id: jobId },
			include: {
				ocr_runs: {
					orderBy: { created_at: "desc" },
					take: 1,
					select: { id: true, extracted_answers_raw: true },
				},
			},
		})
		if (!sub) throw new Error("Job not found")

		const ocrRun = sub.ocr_runs[0]
		if (!ocrRun?.extracted_answers_raw) {
			throw new Error("No extracted answers to edit")
		}

		type RawExtracted = {
			student_name?: string | null
			answers: Array<{ question_number: string; answer_text: string }>
		}
		const raw = ocrRun.extracted_answers_raw as RawExtracted
		const updated = {
			...raw,
			answers: raw.answers.map((a) =>
				a.question_number === questionNumber
					? { ...a, answer_text: newText }
					: a,
			),
		}

		await db.ocrRun.update({
			where: { id: ocrRun.id },
			data: { extracted_answers_raw: updated },
		})

		return { ok: true }
	},
)

export const toggleBookmark = resourceAction({
	type: "submission",
	role: "viewer",
	schema: z.object({ jobId: z.string(), bookmarked: z.boolean() }),
	id: ({ jobId }) => jobId,
}).action(
	async ({
		parsedInput: { jobId, bookmarked },
		ctx,
	}): Promise<{ bookmarked: boolean }> => {
		if (bookmarked) {
			await db.studentSubmissionBookmark.upsert({
				where: {
					user_id_submission_id: {
						user_id: ctx.user.id,
						submission_id: jobId,
					},
				},
				create: { user_id: ctx.user.id, submission_id: jobId },
				update: {},
			})
		} else {
			await db.studentSubmissionBookmark.deleteMany({
				where: { user_id: ctx.user.id, submission_id: jobId },
			})
		}
		return { bookmarked }
	},
)

const submissionFeedbackInput = z.object({
	submissionId: z.string(),
	input: z.object({
		rating: z.enum([
			"positive",
			"negative",
		]) as z.ZodType<SubmissionFeedbackRating>,
		categories: z.array(z.string()).optional(),
		comment: z.string().nullable().optional(),
	}),
})

export const upsertSubmissionFeedback = resourceAction({
	type: "submission",
	role: "viewer",
	schema: submissionFeedbackInput,
	id: ({ submissionId }) => submissionId,
}).action(
	async ({
		parsedInput: { submissionId, input },
		ctx,
	}): Promise<{ feedback: SubmissionFeedback }> => {
		const latestGradingRun = await db.gradingRun.findFirst({
			where: { submission_id: submissionId },
			orderBy: { created_at: "desc" },
			select: { id: true },
		})

		const categories =
			input.categories && input.categories.length > 0
				? input.categories
				: undefined

		const row = await db.submissionFeedback.upsert({
			where: {
				submission_id_created_by: {
					submission_id: submissionId,
					created_by: ctx.user.id,
				},
			},
			create: {
				submission_id: submissionId,
				rating: input.rating,
				categories: categories as unknown as Parameters<
					typeof db.submissionFeedback.create
				>[0]["data"]["categories"],
				comment: input.comment?.trim() || null,
				grading_run_id: latestGradingRun?.id ?? null,
				created_by: ctx.user.id,
			},
			update: {
				rating: input.rating,
				categories: categories as unknown as Parameters<
					typeof db.submissionFeedback.create
				>[0]["data"]["categories"],
				comment: input.comment?.trim() || null,
				grading_run_id: latestGradingRun?.id ?? null,
			},
		})

		return { feedback: toSubmissionFeedback(row) }
	},
)

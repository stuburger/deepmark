"use server"

import { db } from "@/lib/db"
import { auth } from "../../auth"
import { log } from "../../logger"
import type {
	DeleteSubmissionResult,
	LinkStudentToJobResult,
	SubmissionFeedback,
	SubmissionFeedbackRating,
	UpdateExtractedAnswerResult,
	UpdateStudentNameResult,
	UpsertSubmissionFeedbackResult,
} from "../types"
import { toSubmissionFeedback } from "./feedback-mapper"

const TAG = "mark-actions"

export async function updateStudentName(
	jobId: string,
	name: string,
): Promise<UpdateStudentNameResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const sub = await db.studentSubmission.findFirst({
		where: { id: jobId },
		select: { id: true },
	})
	if (!sub) return { ok: false, error: "Job not found" }

	await db.studentSubmission.update({
		where: { id: jobId },
		data: { student_name: name },
	})
	return { ok: true }
}

/**
 * Associates a Student record with a submission so that graded answers
 * are subsequently written to the normalised Answer / MarkingResult tables.
 * Also syncs student_name from the Student record.
 */
export async function linkStudentToJob(
	jobId: string,
	studentId: string,
): Promise<LinkStudentToJobResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const [sub, student] = await Promise.all([
		db.studentSubmission.findFirst({
			where: { id: jobId },
			select: { id: true },
		}),
		db.student.findFirst({
			where: { id: studentId },
		}),
	])
	if (!sub) return { ok: false, error: "Job not found" }
	if (!student) return { ok: false, error: "Student not found" }

	await db.studentSubmission.update({
		where: { id: jobId },
		data: { student_id: studentId, student_name: student.name },
	})

	log.info(TAG, "Student linked to job", {
		userId: session.userId,
		jobId,
		studentId,
	})
	return { ok: true }
}

export async function deleteSubmission(
	jobId: string,
): Promise<DeleteSubmissionResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const sub = await db.studentSubmission.findUnique({
		where: { id: jobId },
		select: { batch_job_id: true, superseded_at: true },
	})

	if (!sub) return { ok: false, error: "Submission not found" }

	await db.$transaction(async (tx) => {
		// Delete child runs then submission. AI annotations cascade-delete with
		// their grading run (FK onDelete: Cascade on grading_run_id).
		await tx.gradingRun.deleteMany({ where: { submission_id: jobId } })
		await tx.ocrRun.deleteMany({ where: { submission_id: jobId } })
		await tx.studentSubmission.delete({ where: { id: jobId } })

		// Keep batch counter in sync — only count non-superseded submissions
		if (sub.batch_job_id && sub.superseded_at === null) {
			await tx.batchIngestJob.update({
				where: { id: sub.batch_job_id },
				data: {
					total_student_jobs: { decrement: 1 },
				},
			})
		}
	})

	return { ok: true }
}

/**
 * Edits a single answer in extracted_answers_raw by question number.
 * The change is persisted so that a subsequent re-mark uses the corrected text.
 */
export async function updateExtractedAnswer(
	jobId: string,
	questionNumber: string,
	newText: string,
): Promise<UpdateExtractedAnswerResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

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
	if (!sub) return { ok: false, error: "Job not found" }

	const ocrRun = sub.ocr_runs[0]
	if (!ocrRun?.extracted_answers_raw)
		return { ok: false, error: "No extracted answers to edit" }

	type RawExtracted = {
		student_name?: string | null
		answers: Array<{ question_number: string; answer_text: string }>
	}
	const raw = ocrRun.extracted_answers_raw as RawExtracted
	const updated = {
		...raw,
		answers: raw.answers.map((a) =>
			a.question_number === questionNumber ? { ...a, answer_text: newText } : a,
		),
	}

	await db.ocrRun.update({
		where: { id: ocrRun.id },
		data: { extracted_answers_raw: updated },
	})

	return { ok: true }
}

export async function upsertSubmissionFeedback(
	submissionId: string,
	input: {
		rating: SubmissionFeedbackRating
		categories?: SubmissionFeedback["categories"]
		comment?: string | null
	},
): Promise<UpsertSubmissionFeedbackResult> {
	try {
		const session = await auth()
		if (!session) return { ok: false, error: "Not authenticated" }

		// Find the latest grading run for this submission to link the feedback
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
					created_by: session.userId,
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
				created_by: session.userId,
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

		return { ok: true, feedback: toSubmissionFeedback(row) }
	} catch {
		return { ok: false, error: "Failed to save feedback" }
	}
}

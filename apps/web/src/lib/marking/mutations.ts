"use server"

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../auth"
import { log } from "../logger"
import type {
	DeleteSubmissionResult,
	GetSubmissionFeedbackResult,
	LinkStudentToJobResult,
	RetriggerGradingResult,
	RetriggerOcrResult,
	SubmissionFeedback,
	SubmissionFeedbackRating,
	TeacherOverride,
	TriggerEnrichmentResult,
	TriggerGradingResult,
	UpdateExtractedAnswerResult,
	UpdateStudentNameResult,
	UpsertSubmissionFeedbackResult,
} from "./types"

const TAG = "mark-actions"

const sqs = new SQSClient({})
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

/**
 * Sets the exam paper on the submission and enqueues it for grading.
 * Requires OCR to have completed first.
 */
export async function triggerGrading(
	jobId: string,
	examPaperId: string,
): Promise<TriggerGradingResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const sub = await db.studentSubmission.findFirst({
		where: { id: jobId },
		include: {
			ocr_runs: {
				orderBy: { created_at: "desc" },
				take: 1,
				select: { extracted_answers_raw: true },
			},
		},
	})
	if (!sub) return { ok: false, error: "Job not found" }
	if (!sub.ocr_runs[0]?.extracted_answers_raw) {
		return { ok: false, error: "OCR must complete before marking" }
	}

	const examPaper = await db.examPaper.findFirst({
		where: { id: examPaperId, is_active: true },
		select: {
			id: true,
			title: true,
			exam_board: true,
			subject: true,
			year: true,
		},
	})
	if (!examPaper) return { ok: false, error: "Exam paper not found" }

	await db.studentSubmission.update({
		where: { id: jobId },
		data: {
			exam_paper_id: examPaperId,
			exam_board: examPaper.exam_board ?? "Unknown",
			subject: examPaper.subject,
			year: examPaper.year,
		},
	})

	await sqs.send(
		new SendMessageCommand({
			QueueUrl: Resource.StudentPaperQueue.url,
			MessageBody: JSON.stringify({ job_id: jobId }),
		}),
	)

	log.info(TAG, "Grading triggered", {
		userId: session.userId,
		jobId,
		examPaperId,
	})
	return { ok: true }
}

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
		// Delete child runs then submission
		await tx.enrichmentRun.deleteMany({ where: { grading_run_id: jobId } })
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

/**
 * Creates a new submission from the same OCR data, then marks the old one as
 * superseded. Submissions are immutable — re-marking always produces a new
 * record so the original result is preserved as history.
 *
 * Copies extracted answers (via new OcrRun), word tokens, and answer regions
 * so grading can run without re-doing OCR.
 */
export async function retriggerGrading(
	jobId: string,
): Promise<RetriggerGradingResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const oldSub = await db.studentSubmission.findFirst({
		where: { id: jobId },
		include: {
			ocr_runs: {
				orderBy: { created_at: "desc" },
				take: 1,
				select: {
					extracted_answers_raw: true,
					page_analyses: true,
					vision_raw_s3_key: true,
				},
			},
		},
	})
	if (!oldSub) return { ok: false, error: "Job not found" }

	const latestOcr = oldSub.ocr_runs[0]
	if (!latestOcr?.extracted_answers_raw)
		return { ok: false, error: "No extracted answers — run OCR first" }

	const newSub = await db.$transaction(async (tx) => {
		const created = await tx.studentSubmission.create({
			data: {
				s3_key: oldSub.s3_key,
				s3_bucket: oldSub.s3_bucket,
				uploaded_by: oldSub.uploaded_by,
				exam_paper_id: oldSub.exam_paper_id,
				exam_board: oldSub.exam_board,
				subject: oldSub.subject,
				year: oldSub.year,
				pages: oldSub.pages as never,
				student_name: oldSub.student_name,
				student_id: oldSub.student_id,
				batch_job_id: oldSub.batch_job_id,
				staged_script_id: oldSub.staged_script_id,
			},
		})

		// Create an OcrRun with the carried-over OCR results
		await tx.ocrRun.create({
			data: {
				id: created.id,
				submission_id: created.id,
				status: "complete",
				extracted_answers_raw: latestOcr.extracted_answers_raw as never,
				page_analyses: latestOcr.page_analyses as never,
				vision_raw_s3_key: latestOcr.vision_raw_s3_key,
			},
		})

		// Copy word tokens — enrichment needs these for annotation placement
		const oldTokens = await tx.studentPaperPageToken.findMany({
			where: { submission_id: jobId },
		})

		if (oldTokens.length > 0) {
			await tx.studentPaperPageToken.createMany({
				data: oldTokens.map((t) => ({
					submission_id: created.id,
					page_order: t.page_order,
					para_index: t.para_index,
					line_index: t.line_index,
					word_index: t.word_index,
					text_raw: t.text_raw,
					text_corrected: t.text_corrected,
					bbox: t.bbox as never,
					confidence: t.confidence,
					question_id: t.question_id,
				})),
			})
		}

		// Copy answer regions — UI needs these for bounding box display
		const oldRegions = await tx.studentPaperAnswerRegion.findMany({
			where: { submission_id: jobId },
		})
		if (oldRegions.length > 0) {
			await tx.studentPaperAnswerRegion.createMany({
				data: oldRegions.map((r) => ({
					submission_id: created.id,
					question_id: r.question_id,
					question_number: r.question_number,
					page_order: r.page_order,
					box: r.box as never,
					source: r.source,
				})),
			})
		}

		await tx.studentSubmission.update({
			where: { id: jobId },
			data: { superseded_at: new Date(), supersede_reason: "re-grade" },
		})

		return created
	})

	await sqs.send(
		new SendMessageCommand({
			QueueUrl: Resource.StudentPaperQueue.url,
			MessageBody: JSON.stringify({ job_id: newSub.id }),
		}),
	)

	log.info(TAG, "Re-grading triggered — new submission created", {
		userId: session.userId,
		oldJobId: jobId,
		newJobId: newSub.id,
	})
	return { ok: true, newJobId: newSub.id }
}

/**
 * Creates a new submission from the same pages, then marks the old one as
 * superseded. Submissions are immutable — re-scanning always produces a new
 * record so the original result is preserved as history.
 */
export async function retriggerOcr(jobId: string): Promise<RetriggerOcrResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const oldSub = await db.studentSubmission.findFirst({
		where: { id: jobId },
	})
	if (!oldSub) return { ok: false, error: "Job not found" }

	type PageEntry = { key: string; order: number; mime_type: string }
	const pages = (oldSub.pages ?? []) as PageEntry[]
	if (pages.length === 0)
		return { ok: false, error: "No pages uploaded — cannot re-scan" }

	const newSub = await db.$transaction(async (tx) => {
		const created = await tx.studentSubmission.create({
			data: {
				s3_key: oldSub.s3_key,
				s3_bucket: oldSub.s3_bucket,
				uploaded_by: oldSub.uploaded_by,
				exam_paper_id: oldSub.exam_paper_id,
				exam_board: oldSub.exam_board,
				subject: oldSub.subject,
				year: oldSub.year,
				pages: oldSub.pages as never,
				student_name: oldSub.student_name,
				student_id: oldSub.student_id,
				batch_job_id: oldSub.batch_job_id,
				staged_script_id: oldSub.staged_script_id,
			},
		})

		await tx.studentSubmission.update({
			where: { id: jobId },
			data: { superseded_at: new Date(), supersede_reason: "re-scan" },
		})

		return created
	})

	await sqs.send(
		new SendMessageCommand({
			QueueUrl: Resource.StudentPaperOcrQueue.url,
			MessageBody: JSON.stringify({ job_id: newSub.id }),
		}),
	)

	log.info(TAG, "Re-OCR triggered — new submission created", {
		userId: session.userId,
		oldJobId: jobId,
		newJobId: newSub.id,
	})
	return { ok: true, newJobId: newSub.id }
}

// ─── Enrichment (Annotations) ────────────────────────────────────────────────

export async function triggerEnrichment(
	jobId: string,
): Promise<TriggerEnrichmentResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const sub = await db.studentSubmission.findFirst({
		where: { id: jobId },
		select: {
			id: true,
			grading_runs: {
				orderBy: { created_at: "desc" },
				take: 1,
				select: {
					id: true,
					status: true,
					enrichment_runs: {
						orderBy: { created_at: "desc" },
						take: 1,
						select: { status: true },
					},
				},
			},
		},
	})
	if (!sub) return { ok: false, error: "Job not found" }

	const latestGrading = sub.grading_runs[0]
	if (!latestGrading || latestGrading.status !== "complete") {
		return { ok: false, error: "Job must be fully graded before annotating" }
	}
	const latestEnrichment = latestGrading.enrichment_runs[0]
	if (latestEnrichment?.status === "processing") {
		return { ok: false, error: "Annotations are already being generated" }
	}

	await sqs.send(
		new SendMessageCommand({
			QueueUrl: Resource.StudentPaperEnrichQueue.url,
			MessageBody: JSON.stringify({ job_id: jobId }),
		}),
	)

	log.info(TAG, "Enrichment triggered", { userId: session.userId, jobId })
	return { ok: true }
}

// ─── Teacher Overrides ──────────────────────────────────────────────────────

export async function upsertTeacherOverride(
	submissionId: string,
	questionId: string,
	input: {
		score_override: number
		reason?: string | null
		feedback_override?: string | null
	},
): Promise<
	{ ok: true; override: TeacherOverride } | { ok: false; error: string }
> {
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
): Promise<{ ok: true } | { ok: false; error: string }> {
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

// ─── Submission Feedback ────────────────────────────────────────────────────

function toFeedback(row: {
	id: string
	submission_id: string
	rating: string
	categories: unknown
	comment: string | null
	grading_run_id: string | null
	created_at: Date
	updated_at: Date
}): SubmissionFeedback {
	return {
		id: row.id,
		submission_id: row.submission_id,
		rating: row.rating as SubmissionFeedbackRating,
		categories: (row.categories as SubmissionFeedback["categories"]) ?? null,
		comment: row.comment,
		grading_run_id: row.grading_run_id,
		created_at: row.created_at,
		updated_at: row.updated_at,
	}
}

export async function getSubmissionFeedback(
	submissionId: string,
): Promise<GetSubmissionFeedbackResult> {
	try {
		const session = await auth()
		if (!session) return { ok: false, error: "Not authenticated" }

		const row = await db.submissionFeedback.findUnique({
			where: {
				submission_id_created_by: {
					submission_id: submissionId,
					created_by: session.userId,
				},
			},
		})

		return { ok: true, feedback: row ? toFeedback(row) : null }
	} catch {
		return { ok: false, error: "Failed to fetch feedback" }
	}
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

		return { ok: true, feedback: toFeedback(row) }
	} catch {
		return { ok: false, error: "Failed to save feedback" }
	}
}

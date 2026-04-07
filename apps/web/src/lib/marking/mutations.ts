"use server"

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import {
	type EnrichmentStatus,
	createPrismaClient,
	logStudentPaperEvent,
} from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../auth"
import { log } from "../logger"
import type {
	DeleteStudentPaperJobResult,
	LinkStudentToJobResult,
	RetriggerGradingResult,
	RetriggerOcrResult,
	TriggerEnrichmentResult,
	TriggerGradingResult,
	UpdateExtractedAnswerResult,
	UpdateStudentNameResult,
} from "./types"

const TAG = "mark-actions"

const sqs = new SQSClient({})
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

/**
 * Sets the exam paper on the job and enqueues it for grading.
 * Requires OCR to have completed first (status: text_extracted).
 */
export async function triggerGrading(
	jobId: string,
	examPaperId: string,
): Promise<TriggerGradingResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const job = await db.studentPaperJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
	})
	if (!job) return { ok: false, error: "Job not found" }

	if (!job.extracted_answers_raw) {
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

	await db.studentPaperJob.update({
		where: { id: jobId },
		data: {
			exam_paper_id: examPaperId,
			exam_board: examPaper.exam_board ?? "Unknown",
			subject: examPaper.subject,
			year: examPaper.year,
			status: "pending",
		},
	})

	await sqs.send(
		new SendMessageCommand({
			QueueUrl: Resource.StudentPaperQueue.url,
			MessageBody: JSON.stringify({ job_id: jobId }),
		}),
	)

	void logStudentPaperEvent(db, jobId, {
		type: "exam_paper_selected",
		at: new Date().toISOString(),
		title: examPaper.title,
	})

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
	const job = await db.studentPaperJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
	})
	if (!job) return { ok: false, error: "Job not found" }
	await db.studentPaperJob.update({
		where: { id: jobId },
		data: { student_name: name },
	})
	return { ok: true }
}

/**
 * Associates a Student record with a StudentPaperJob so that graded answers
 * are subsequently written to the normalised Answer / MarkingResult tables.
 * Also syncs student_name from the Student record.
 */
export async function linkStudentToJob(
	jobId: string,
	studentId: string,
): Promise<LinkStudentToJobResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const [job, student] = await Promise.all([
		db.studentPaperJob.findFirst({
			where: { id: jobId, uploaded_by: session.userId },
		}),
		db.student.findFirst({
			where: { id: studentId, teacher_id: session.userId },
		}),
	])
	if (!job) return { ok: false, error: "Job not found" }
	if (!student) return { ok: false, error: "Student not found" }

	await db.studentPaperJob.update({
		where: { id: jobId },
		data: { student_id: studentId, student_name: student.name },
	})

	void logStudentPaperEvent(db, jobId, {
		type: "student_linked",
		at: new Date().toISOString(),
		student_name: student.name,
	})
	log.info(TAG, "Student linked to job", {
		userId: session.userId,
		jobId,
		studentId,
	})
	return { ok: true }
}

export async function deleteStudentPaperJob(
	jobId: string,
): Promise<DeleteStudentPaperJobResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const job = await db.studentPaperJob.findUnique({
		where: { id: jobId },
		select: { uploaded_by: true, batch_job_id: true, superseded_at: true },
	})

	if (!job) return { ok: false, error: "Submission not found" }
	if (job.uploaded_by !== session.userId)
		return { ok: false, error: "Not authorised" }

	await db.$transaction(async (tx) => {
		await tx.studentPaperJob.delete({ where: { id: jobId } })

		// Keep batch counter in sync — only count non-superseded jobs
		if (job.batch_job_id && job.superseded_at === null) {
			await tx.batchIngestJob.update({
				where: { id: job.batch_job_id },
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

	const job = await db.studentPaperJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
	})
	if (!job) return { ok: false, error: "Job not found" }
	if (!job.extracted_answers_raw)
		return { ok: false, error: "No extracted answers to edit" }

	type RawExtracted = {
		student_name?: string | null
		answers: Array<{ question_number: string; answer_text: string }>
	}
	const raw = job.extracted_answers_raw as RawExtracted
	const updated = {
		...raw,
		answers: raw.answers.map((a) =>
			a.question_number === questionNumber ? { ...a, answer_text: newText } : a,
		),
	}

	await db.studentPaperJob.update({
		where: { id: jobId },
		data: { extracted_answers_raw: updated },
	})

	return { ok: true }
}

/**
 * Creates a new job from the same OCR data as the given job, then marks the
 * old job as superseded. Jobs are immutable — re-marking always produces a new
 * record so the original result is preserved as history.
 *
 * Copies extracted answers, word tokens, and answer regions so grading can run
 * without re-doing OCR.
 */
export async function retriggerGrading(
	jobId: string,
): Promise<RetriggerGradingResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const oldJob = await db.studentPaperJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
	})
	if (!oldJob) return { ok: false, error: "Job not found" }
	if (!oldJob.extracted_answers_raw)
		return { ok: false, error: "No extracted answers — run OCR first" }

	const newJob = await db.$transaction(async (tx) => {
		const created = await tx.studentPaperJob.create({
			data: {
				s3_key: oldJob.s3_key,
				s3_bucket: oldJob.s3_bucket,
				status: "pending",
				uploaded_by: oldJob.uploaded_by,
				exam_paper_id: oldJob.exam_paper_id,
				exam_board: oldJob.exam_board,
				subject: oldJob.subject,
				year: oldJob.year,
				pages: oldJob.pages as never,
				student_name: oldJob.student_name,
				batch_job_id: oldJob.batch_job_id,
				staged_script_id: oldJob.staged_script_id,
				// Carry over OCR results so grading can run without re-OCR
				extracted_answers_raw: oldJob.extracted_answers_raw as never,
				page_analyses: oldJob.page_analyses as never,
				vision_raw_s3_key: oldJob.vision_raw_s3_key,
			},
		})

		// Phase 3 dual-write: create StudentSubmission (submission_id === jobId convention)
		await tx.studentSubmission
			.create({
				data: {
					id: created.id,
					s3_key: oldJob.s3_key,
					s3_bucket: oldJob.s3_bucket,
					uploaded_by: oldJob.uploaded_by,
					exam_paper_id: oldJob.exam_paper_id!,
					exam_board: oldJob.exam_board ?? "Unknown",
					pages: oldJob.pages as never,
					student_name: oldJob.student_name,
					student_id: oldJob.student_id,
					subject: oldJob.subject,
					year: oldJob.year,
					batch_job_id: oldJob.batch_job_id,
					staged_script_id: oldJob.staged_script_id,
				},
			})
			.catch(() => {})

		// Copy word tokens — enrichment needs these for annotation placement
		const oldTokens = await tx.studentPaperPageToken.findMany({
			where: { job_id: jobId },
		})
		if (oldTokens.length > 0) {
			await tx.studentPaperPageToken.createMany({
				data: oldTokens.map((t) => ({
					job_id: created.id,
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
			where: { job_id: jobId },
		})
		if (oldRegions.length > 0) {
			await tx.studentPaperAnswerRegion.createMany({
				data: oldRegions.map((r) => ({
					job_id: created.id,
					submission_id: created.id,
					question_id: r.question_id,
					question_number: r.question_number,
					page_order: r.page_order,
					box: r.box as never,
					source: r.source,
				})),
			})
		}

		await tx.studentPaperJob.update({
			where: { id: jobId },
			data: { superseded_at: new Date() },
		})

		return created
	})

	await sqs.send(
		new SendMessageCommand({
			QueueUrl: Resource.StudentPaperQueue.url,
			MessageBody: JSON.stringify({ job_id: newJob.id }),
		}),
	)

	log.info(TAG, "Re-grading triggered — new job created", {
		userId: session.userId,
		oldJobId: jobId,
		newJobId: newJob.id,
	})
	return { ok: true, newJobId: newJob.id }
}

/**
 * Creates a new job from the same pages as the given job, then marks the old
 * job as superseded. Jobs are immutable — re-scanning always produces a new
 * record so the original result is preserved as history.
 */
export async function retriggerOcr(jobId: string): Promise<RetriggerOcrResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const oldJob = await db.studentPaperJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
	})
	if (!oldJob) return { ok: false, error: "Job not found" }

	type PageEntry = { key: string; order: number; mime_type: string }
	const pages = (oldJob.pages ?? []) as PageEntry[]
	if (pages.length === 0)
		return { ok: false, error: "No pages uploaded — cannot re-scan" }

	const newJob = await db.$transaction(async (tx) => {
		const created = await tx.studentPaperJob.create({
			data: {
				s3_key: oldJob.s3_key,
				s3_bucket: oldJob.s3_bucket,
				status: "pending",
				uploaded_by: oldJob.uploaded_by,
				exam_paper_id: oldJob.exam_paper_id,
				exam_board: oldJob.exam_board,
				subject: oldJob.subject,
				year: oldJob.year,
				pages: oldJob.pages as never,
				student_name: oldJob.student_name,
				batch_job_id: oldJob.batch_job_id,
				staged_script_id: oldJob.staged_script_id,
			},
		})

		// Phase 3 dual-write: create StudentSubmission (submission_id === jobId convention)
		await tx.studentSubmission
			.create({
				data: {
					id: created.id,
					s3_key: oldJob.s3_key,
					s3_bucket: oldJob.s3_bucket,
					uploaded_by: oldJob.uploaded_by,
					exam_paper_id: oldJob.exam_paper_id!,
					exam_board: oldJob.exam_board ?? "Unknown",
					pages: oldJob.pages as never,
					student_name: oldJob.student_name,
					student_id: oldJob.student_id,
					subject: oldJob.subject,
					year: oldJob.year,
					batch_job_id: oldJob.batch_job_id,
					staged_script_id: oldJob.staged_script_id,
				},
			})
			.catch(() => {})

		await tx.studentPaperJob.update({
			where: { id: jobId },
			data: { superseded_at: new Date() },
		})

		return created
	})

	await sqs.send(
		new SendMessageCommand({
			QueueUrl: Resource.StudentPaperOcrQueue.url,
			MessageBody: JSON.stringify({ job_id: newJob.id }),
		}),
	)

	log.info(TAG, "Re-OCR triggered — new job created", {
		userId: session.userId,
		oldJobId: jobId,
		newJobId: newJob.id,
	})
	return { ok: true, newJobId: newJob.id }
}

// ─── Enrichment (Annotations) ────────────────────────────────────────────────

export async function triggerEnrichment(
	jobId: string,
): Promise<TriggerEnrichmentResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const job = await db.studentPaperJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
		select: { id: true, status: true, enrichment_status: true },
	})
	if (!job) return { ok: false, error: "Job not found" }
	if (job.status !== "ocr_complete") {
		return { ok: false, error: "Job must be fully graded before annotating" }
	}
	if (job.enrichment_status === "processing") {
		return { ok: false, error: "Annotations are already being generated" }
	}

	// Mark as pending — the handler creates a new EnrichmentRun with its own
	// annotations. Old runs and their annotations are preserved as history.
	await db.studentPaperJob.update({
		where: { id: jobId },
		data: { enrichment_status: "pending" satisfies EnrichmentStatus },
	})

	await sqs.send(
		new SendMessageCommand({
			QueueUrl: Resource.StudentPaperEnrichQueue.url,
			MessageBody: JSON.stringify({ job_id: jobId }),
		}),
	)

	log.info(TAG, "Enrichment triggered", { userId: session.userId, jobId })
	return { ok: true }
}

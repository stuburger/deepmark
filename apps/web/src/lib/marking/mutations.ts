"use server"

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { Prisma, createPrismaClient, logStudentPaperEvent } from "@mcp-gcse/db"
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
		select: { uploaded_by: true },
	})

	if (!job) return { ok: false, error: "Submission not found" }
	if (job.uploaded_by !== session.userId)
		return { ok: false, error: "Not authorised" }

	await db.studentPaperJob.delete({ where: { id: jobId } })

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
 * Re-queues a completed or failed job for grading using the already-selected
 * exam paper. Clears previous grading results so the processor starts fresh.
 */
export async function retriggerGrading(
	jobId: string,
): Promise<RetriggerGradingResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const job = await db.studentPaperJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
	})
	if (!job) return { ok: false, error: "Job not found" }
	if (!job.extracted_answers_raw)
		return { ok: false, error: "No extracted answers — run OCR first" }

	await db.studentPaperJob.update({
		where: { id: jobId },
		data: { status: "pending", grading_results: [], error: null },
	})

	await sqs.send(
		new SendMessageCommand({
			QueueUrl: Resource.StudentPaperQueue.url,
			MessageBody: JSON.stringify({ job_id: jobId }),
		}),
	)

	log.info(TAG, "Re-grading triggered", { userId: session.userId, jobId })
	return { ok: true }
}

/**
 * Resets the job back to OCR pending, clearing all extracted and graded data.
 * The existing page uploads are kept so the OCR processor can re-read them.
 */
export async function retriggerOcr(jobId: string): Promise<RetriggerOcrResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const job = await db.studentPaperJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
	})
	if (!job) return { ok: false, error: "Job not found" }

	type PageEntry = { key: string; order: number; mime_type: string }
	const pages = (job.pages ?? []) as PageEntry[]
	if (pages.length === 0)
		return { ok: false, error: "No pages uploaded — cannot re-scan" }

	await db.studentPaperJob.update({
		where: { id: jobId },
		data: {
			status: "pending",
			extracted_answers_raw: Prisma.JsonNull,
			grading_results: [],
			student_name: null,
			detected_subject: null,
			error: null,
		},
	})

	await sqs.send(
		new SendMessageCommand({
			QueueUrl: Resource.StudentPaperOcrQueue.url,
			MessageBody: JSON.stringify({ job_id: jobId }),
		}),
	)

	log.info(TAG, "Re-OCR triggered", { userId: session.userId, jobId })
	return { ok: true }
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

	// Delete any existing annotations (re-generation)
	await db.studentPaperAnnotation.deleteMany({ where: { job_id: jobId } })

	await db.studentPaperJob.update({
		where: { id: jobId },
		data: { enrichment_status: "pending" },
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

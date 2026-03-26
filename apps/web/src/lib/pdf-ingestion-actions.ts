"use server"

import {
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { createPrismaClient } from "@mcp-gcse/db"
import type { Subject } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "./auth"
import { log } from "./logger"

const TAG = "pdf-ingestion-actions"
const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})
const sqs = new SQSClient({})
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

export type PdfDocumentType = "mark_scheme" | "exemplar" | "question_paper"

export type CreatePdfIngestionUploadResult =
	| { ok: true; jobId: string; url: string }
	| { ok: false; error: string }

export async function createPdfIngestionUpload(input: {
	document_type: PdfDocumentType
	exam_board: string
	subject?: Subject
	year?: number
	paper_reference?: string
	auto_create_exam_paper?: boolean
	exam_paper_id?: string
	run_adversarial_loop?: boolean
}): Promise<CreatePdfIngestionUploadResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	if (!input.exam_board.trim())
		return { ok: false, error: "Exam board is required" }
	if (!input.subject) {
		return { ok: false, error: "Subject is required" }
	}

	log.info(TAG, "createPdfIngestionUpload called", {
		userId: session.userId,
		document_type: input.document_type,
		subject: input.subject,
		exam_board: input.exam_board,
		exam_paper_id: input.exam_paper_id ?? null,
	})

	const prefix =
		input.document_type === "mark_scheme"
			? "pdfs/mark-schemes"
			: input.document_type === "question_paper"
				? "pdfs/question-papers"
				: "pdfs/exemplars"
	const job = await db.pdfIngestionJob.create({
		data: {
			document_type: input.document_type,
			s3_key: "",
			s3_bucket: bucketName,
			status: "pending",
			uploaded_by: session.userId,
			exam_board: input.exam_board.trim(),
			subject: input.subject ?? null,
			year: input.year ?? null,
			paper_reference: input.paper_reference?.trim() ?? null,
			auto_create_exam_paper: input.exam_paper_id
				? false
				: (input.auto_create_exam_paper ?? true),
			run_adversarial_loop: input.run_adversarial_loop ?? false,
			exam_paper_id: input.exam_paper_id ?? null,
		},
	})
	const key = `${prefix}/${job.id}/document.pdf`
	await db.pdfIngestionJob.update({
		where: { id: job.id },
		data: { s3_key: key },
	})
	const command = new PutObjectCommand({
		Bucket: bucketName,
		Key: key,
		ContentType: "application/pdf",
	})
	const url = await getSignedUrl(s3, command, { expiresIn: 3600 })
	log.info(TAG, "PDF ingestion job created", {
		userId: session.userId,
		jobId: job.id,
		document_type: input.document_type,
		key,
	})
	return { ok: true, jobId: job.id, url }
}

export async function createLinkedPdfUpload(input: {
	exam_paper_id: string
	document_type: "mark_scheme" | "exemplar" | "question_paper"
	run_adversarial_loop?: boolean
}): Promise<CreatePdfIngestionUploadResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const examPaper = await db.examPaper.findFirst({
		where: { id: input.exam_paper_id, is_active: true },
		select: { id: true, exam_board: true, subject: true, year: true },
	})
	if (!examPaper) return { ok: false, error: "Exam paper not found" }

	const prefix =
		input.document_type === "mark_scheme"
			? "pdfs/mark-schemes"
			: input.document_type === "question_paper"
				? "pdfs/question-papers"
				: "pdfs/exemplars"

	const job = await db.pdfIngestionJob.create({
		data: {
			document_type: input.document_type,
			s3_key: "",
			s3_bucket: bucketName,
			status: "pending",
			uploaded_by: session.userId,
			exam_board: examPaper.exam_board ?? "Other",
			subject: examPaper.subject,
			year: examPaper.year,
			auto_create_exam_paper: false,
			run_adversarial_loop: input.run_adversarial_loop ?? false,
			exam_paper_id: examPaper.id,
		},
	})
	const key = `${prefix}/${job.id}/document.pdf`
	await db.pdfIngestionJob.update({
		where: { id: job.id },
		data: { s3_key: key },
	})
	const command = new PutObjectCommand({
		Bucket: bucketName,
		Key: key,
		ContentType: "application/pdf",
	})
	const url = await getSignedUrl(s3, command, { expiresIn: 3600 })
	log.info(TAG, "Linked PDF upload job created", {
		userId: session.userId,
		jobId: job.id,
		document_type: input.document_type,
		exam_paper_id: examPaper.id,
	})
	return { ok: true, jobId: job.id, url }
}

export type GetPdfIngestionJobStatusResult =
	| {
			ok: true
			status: string
			error: string | null
			detected_exam_paper_metadata: unknown
			auto_create_exam_paper: boolean
	  }
	| { ok: false; error: string }

export type ActiveExamPaperIngestionJob = {
	id: string
	document_type: string
	status: string
	error: string | null
}

export type GetActiveIngestionJobsForExamPaperResult =
	| { ok: true; jobs: ActiveExamPaperIngestionJob[] }
	| { ok: false; error: string }

/**
 * Returns in-progress jobs linked to this exam paper (for teacher UI polling),
 * plus any recently failed/cancelled jobs so the teacher can see what went wrong.
 */
export async function getActiveIngestionJobsForExamPaper(
	examPaperId: string,
): Promise<GetActiveIngestionJobsForExamPaperResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const jobs = await db.pdfIngestionJob.findMany({
		where: {
			exam_paper_id: examPaperId,
			uploaded_by: session.userId,
			OR: [
				// Actively running
				{ status: { notIn: ["ocr_complete", "failed", "cancelled"] } },
				// Failed/cancelled within the last hour — shown so the teacher can see the error
				{
					status: { in: ["failed", "cancelled"] },
					created_at: { gte: new Date(Date.now() - 60 * 60 * 1000) },
				},
			],
		},
		orderBy: { created_at: "desc" },
		select: {
			id: true,
			document_type: true,
			status: true,
			error: true,
		},
	})
	return {
		ok: true,
		jobs: jobs.map((j) => ({
			id: j.id,
			document_type: j.document_type,
			status: j.status,
			error: j.error,
		})),
	}
}

export async function getPdfIngestionJobStatus(
	jobId: string,
): Promise<GetPdfIngestionJobStatusResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const job = await db.pdfIngestionJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
	})
	if (!job) return { ok: false, error: "Job not found" }
	return {
		ok: true,
		status: job.status,
		error: job.error,
		detected_exam_paper_metadata: job.detected_exam_paper_metadata,
		auto_create_exam_paper: job.auto_create_exam_paper,
	}
}

export type CreateExamPaperFromJobResult =
	| { ok: true; examPaperId: string }
	| { ok: false; error: string }

export async function createExamPaperFromJob(input: {
	job_id: string
	title: string
	subject: Subject
	exam_board: string
	total_marks: number
	duration_minutes: number
	year?: number
	paper_number?: number
}): Promise<CreateExamPaperFromJobResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const job = await db.pdfIngestionJob.findFirst({
		where: { id: input.job_id, uploaded_by: session.userId },
	})
	if (!job) return { ok: false, error: "Job not found" }
	if (job.status !== "ocr_complete") {
		return { ok: false, error: "Job has not completed processing" }
	}
	if (
		job.document_type !== "mark_scheme" &&
		job.document_type !== "question_paper"
	) {
		return {
			ok: false,
			error:
				"Only mark scheme and question paper jobs can create an exam paper",
		}
	}

	const questions = await db.question.findMany({
		where: { source_pdf_ingestion_job_id: input.job_id },
		orderBy: { created_at: "asc" },
	})
	if (questions.length === 0) {
		return { ok: false, error: "No questions found for this job" }
	}

	const examPaper = await db.examPaper.create({
		data: {
			title: input.title,
			subject: input.subject,
			exam_board: input.exam_board,
			year: input.year ?? new Date().getFullYear(),
			paper_number: input.paper_number ?? null,
			total_marks: input.total_marks,
			duration_minutes: input.duration_minutes,
			created_by_id: session.userId,
		},
	})
	await db.examSection.create({
		data: {
			exam_paper_id: examPaper.id,
			title: "Section 1",
			total_marks: input.total_marks,
			order: 0,
			created_by_id: session.userId,
		},
	})
	const section = await db.examSection.findFirst({
		where: { exam_paper_id: examPaper.id },
	})
	if (!section) return { ok: false, error: "Failed to create section" }
	for (let i = 0; i < questions.length; i++) {
		await db.examSectionQuestion.create({
			data: {
				exam_section_id: section.id,
				question_id: questions[i]?.id ?? "",
				order: i + 1,
			},
		})
	}
	return { ok: true, examPaperId: examPaper.id }
}

export type PdfIngestionJobListItem = {
	id: string
	document_type: string
	status: string
	exam_board: string
	subject: string | null
	year: number | null
	paper_reference: string | null
	attempt_count: number
	error: string | null
	created_at: Date
	processed_at: Date | null
}

export type ListPdfIngestionJobsResult =
	| { ok: true; jobs: PdfIngestionJobListItem[] }
	| { ok: false; error: string }

export async function listPdfIngestionJobs(): Promise<ListPdfIngestionJobsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const jobs = await db.pdfIngestionJob.findMany({
		where: { uploaded_by: session.userId },
		orderBy: { created_at: "desc" },
		select: {
			id: true,
			document_type: true,
			status: true,
			exam_board: true,
			subject: true,
			year: true,
			paper_reference: true,
			attempt_count: true,
			error: true,
			created_at: true,
			processed_at: true,
		},
	})
	return { ok: true, jobs }
}

export type JobMarkPoint = {
	point_number: number
	description: string
	points: number
	criteria: string
}

export type JobTestRun = {
	id: string
	target_score: number
	actual_score: number
	delta: number
	converged: boolean
	grader_reasoning: string
	student_answer: string
}

export type JobMarkScheme = {
	id: string
	description: string
	points_total: number
	link_status: string
	marking_method: string
	mark_points: JobMarkPoint[]
	test_runs: JobTestRun[]
}

export type JobQuestion = {
	id: string
	text: string
	points: number | null
	question_type: string
	origin: string
	mark_schemes: JobMarkScheme[]
}

export type JobExemplar = {
	id: string
	raw_question_text: string
	level: number
	answer_text: string
	expected_score: number | null
	mark_band: string | null
}

export type PdfIngestionJobDetail = {
	id: string
	document_type: string
	status: string
	s3_key: string
	s3_bucket: string
	exam_board: string
	subject: string | null
	year: number | null
	paper_reference: string | null
	attempt_count: number
	auto_create_exam_paper: boolean
	run_adversarial_loop: boolean
	detected_exam_paper_metadata: unknown
	exam_paper_id: string | null
	exam_paper_title: string | null
	error: string | null
	created_at: Date
	processed_at: Date | null
	question_count: number
	exemplar_count: number
	questions: JobQuestion[]
	exemplars: JobExemplar[]
}

export type GetPdfIngestionJobDetailResult =
	| { ok: true; job: PdfIngestionJobDetail }
	| { ok: false; error: string }

export async function getPdfIngestionJobDetail(
	jobId: string,
): Promise<GetPdfIngestionJobDetailResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const job = await db.pdfIngestionJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
		include: {
			exam_paper: { select: { id: true, title: true } },
			created_questions: {
				orderBy: { created_at: "asc" },
				include: {
					mark_schemes: {
						include: {
							test_runs: {
								orderBy: { created_at: "asc" },
								select: {
									id: true,
									target_score: true,
									actual_score: true,
									delta: true,
									converged: true,
									grader_reasoning: true,
									student_answer: true,
								},
							},
						},
					},
				},
			},
			exemplars: {
				orderBy: { created_at: "asc" },
				select: {
					id: true,
					raw_question_text: true,
					level: true,
					answer_text: true,
					expected_score: true,
					mark_band: true,
				},
			},
		},
	})
	if (!job) return { ok: false, error: "Job not found" }

	const questions: JobQuestion[] = job.created_questions.map((q) => ({
		id: q.id,
		text: q.text,
		points: q.points,
		question_type: q.question_type,
		origin: q.origin,
		mark_schemes: q.mark_schemes.map((ms) => ({
			id: ms.id,
			description: ms.description,
			points_total: ms.points_total,
			link_status: ms.link_status,
			marking_method: ms.marking_method,
			mark_points: (ms.mark_points as JobMarkPoint[] | null) ?? [],
			test_runs: ms.test_runs,
		})),
	}))

	return {
		ok: true,
		job: {
			id: job.id,
			document_type: job.document_type,
			status: job.status,
			s3_key: job.s3_key,
			s3_bucket: job.s3_bucket,
			exam_board: job.exam_board,
			subject: job.subject,
			year: job.year,
			paper_reference: job.paper_reference,
			attempt_count: job.attempt_count,
			auto_create_exam_paper: job.auto_create_exam_paper,
			run_adversarial_loop: job.run_adversarial_loop,
			detected_exam_paper_metadata: job.detected_exam_paper_metadata,
			exam_paper_id: job.exam_paper_id,
			exam_paper_title: job.exam_paper?.title ?? null,
			error: job.error,
			created_at: job.created_at,
			processed_at: job.processed_at,
			question_count: job.created_questions.length,
			exemplar_count: job.exemplars.length,
			questions,
			exemplars: job.exemplars,
		},
	}
}

export type PdfDocument = {
	id: string
	document_type: string
	processed_at: Date | null
}

export type GetPdfDocumentsForPaperResult =
	| { ok: true; documents: PdfDocument[] }
	| { ok: false; error: string }

/**
 * Returns all successfully completed ingestion jobs for an exam paper.
 * Used to populate the PDF documents panel on the exam paper detail page.
 */
export async function getPdfDocumentsForPaper(
	examPaperId: string,
): Promise<GetPdfDocumentsForPaperResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const jobs = await db.pdfIngestionJob.findMany({
		where: {
			exam_paper_id: examPaperId,
			status: "ocr_complete",
		},
		orderBy: { processed_at: "desc" },
		select: {
			id: true,
			document_type: true,
			processed_at: true,
		},
	})
	return {
		ok: true,
		documents: jobs.map((j) => ({
			id: j.id,
			document_type: j.document_type,
			processed_at: j.processed_at,
		})),
	}
}

const INGESTION_UI_TERMINAL = new Set(["ocr_complete", "failed", "cancelled"])

export type ExamPaperIngestionLiveState = {
	jobs: ActiveExamPaperIngestionJob[]
	documents: PdfDocument[]
}

/**
 * Single DB read for the exam paper detail page: completed PDFs (all uploaders)
 * plus in-progress / recent-failure jobs for the current user only.
 * Poll this from one place to drive upload cards + processing banners.
 */
export async function getExamPaperIngestionLiveState(
	examPaperId: string,
): Promise<
	| { ok: true; jobs: ActiveExamPaperIngestionJob[]; documents: PdfDocument[] }
	| { ok: false; error: string }
> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

	const rows = await db.pdfIngestionJob.findMany({
		where: { exam_paper_id: examPaperId },
		orderBy: { created_at: "desc" },
		take: 200,
		select: {
			id: true,
			document_type: true,
			status: true,
			error: true,
			processed_at: true,
			created_at: true,
			uploaded_by: true,
		},
	})

	const documents: PdfDocument[] = []
	const jobs: ActiveExamPaperIngestionJob[] = []

	for (const j of rows) {
		if (j.status === "ocr_complete") {
			documents.push({
				id: j.id,
				document_type: j.document_type,
				processed_at: j.processed_at,
			})
			continue
		}
		if (j.uploaded_by !== session.userId) continue

		const isNonTerminal = !INGESTION_UI_TERMINAL.has(j.status)
		const isRecentFailure =
			(j.status === "failed" || j.status === "cancelled") &&
			j.created_at >= oneHourAgo
		if (isNonTerminal || isRecentFailure) {
			jobs.push({
				id: j.id,
				document_type: j.document_type,
				status: j.status,
				error: j.error,
			})
		}
	}

	documents.sort((a, b) => {
		const ta = a.processed_at?.getTime() ?? 0
		const tb = b.processed_at?.getTime() ?? 0
		return tb - ta
	})

	return { ok: true, jobs, documents }
}

export type GetPdfDownloadUrlResult =
	| { ok: true; url: string }
	| { ok: false; error: string }

export async function getPdfIngestionJobDownloadUrl(
	jobId: string,
): Promise<GetPdfDownloadUrlResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const job = await db.pdfIngestionJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
		select: { s3_key: true, s3_bucket: true },
	})
	if (!job) return { ok: false, error: "Job not found" }
	if (!job.s3_key) return { ok: false, error: "No PDF on file for this job" }
	const command = new GetObjectCommand({
		Bucket: job.s3_bucket,
		Key: job.s3_key,
	})
	const url = await getSignedUrl(s3, command, { expiresIn: 300 })
	return { ok: true, url }
}

export type RetriggerPdfIngestionJobResult =
	| { ok: true }
	| { ok: false; error: string }

export type CancelPdfIngestionJobResult =
	| { ok: true }
	| { ok: false; error: string }

export async function cancelPdfIngestionJob(
	jobId: string,
): Promise<CancelPdfIngestionJobResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const job = await db.pdfIngestionJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
		select: { id: true, status: true },
	})
	if (!job) return { ok: false, error: "Job not found" }
	const terminal = ["ocr_complete", "failed", "cancelled"]
	if (terminal.includes(job.status)) {
		return { ok: false, error: "Job is already in a terminal state" }
	}
	await db.pdfIngestionJob.update({
		where: { id: job.id },
		data: { status: "cancelled", error: "Cancelled by user" },
	})
	return { ok: true }
}

export async function retriggerPdfIngestionJob(
	jobId: string,
): Promise<RetriggerPdfIngestionJobResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const job = await db.pdfIngestionJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
	})
	if (!job) return { ok: false, error: "Job not found" }
	const terminal = ["failed", "ocr_complete", "cancelled"]
	if (!terminal.includes(job.status)) {
		return {
			ok: false,
			error: "Job can only be retriggered when failed, cancelled, or completed",
		}
	}

	log.info(TAG, "retriggerPdfIngestionJob called", {
		userId: session.userId,
		jobId,
		document_type: job.document_type,
		previous_status: job.status,
	})

	await db.pdfIngestionJob.update({
		where: { id: jobId },
		data: { status: "pending", error: null },
	})
	const queueUrl =
		job.document_type === "mark_scheme"
			? Resource.MarkSchemePdfQueue.url
			: job.document_type === "question_paper"
				? Resource.QuestionPaperQueue.url
				: Resource.ExemplarQueue.url
	await sqs.send(
		new SendMessageCommand({
			QueueUrl: queueUrl,
			MessageBody: JSON.stringify({ job_id: jobId }),
		}),
	)
	log.info(TAG, "Job retriggered", { jobId, document_type: job.document_type })
	return { ok: true }
}

export type CheckExistingDocumentResult =
	| { ok: true; exists: false }
	| { ok: true; exists: true; questionCount: number; exemplarCount: number }
	| { ok: false; error: string }

export async function checkExistingDocument(
	examPaperId: string,
	documentType: "mark_scheme" | "exemplar" | "question_paper",
): Promise<CheckExistingDocumentResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const jobs = await db.pdfIngestionJob.findMany({
		where: {
			exam_paper_id: examPaperId,
			document_type: documentType,
			status: "ocr_complete",
		},
		select: {
			id: true,
			_count: { select: { created_questions: true, exemplars: true } },
		},
	})

	if (jobs.length === 0) return { ok: true, exists: false }

	const questionCount = jobs.reduce(
		(sum, j) => sum + j._count.created_questions,
		0,
	)
	const exemplarCount = jobs.reduce((sum, j) => sum + j._count.exemplars, 0)

	return { ok: true, exists: true, questionCount, exemplarCount }
}

export type ArchiveExistingDocumentResult =
	| { ok: true }
	| { ok: false; error: string }

export async function archiveExistingDocument(
	examPaperId: string,
	documentType: "mark_scheme" | "exemplar" | "question_paper",
): Promise<ArchiveExistingDocumentResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const jobs = await db.pdfIngestionJob.findMany({
		where: {
			exam_paper_id: examPaperId,
			document_type: documentType,
			status: "ocr_complete",
		},
		select: { id: true },
	})

	if (jobs.length === 0) return { ok: true }

	const jobIds = jobs.map((j) => j.id)

	log.info(TAG, "archiveExistingDocument called", {
		userId: session.userId,
		examPaperId,
		documentType,
		jobCount: jobs.length,
	})

	if (documentType === "exemplar") {
		await db.exemplarAnswer.deleteMany({
			where: { pdf_ingestion_job_id: { in: jobIds } },
		})
	} else {
		const questions = await db.question.findMany({
			where: { source_pdf_ingestion_job_id: { in: jobIds } },
			select: { id: true },
		})
		await db.examSectionQuestion.deleteMany({
			where: { question_id: { in: questions.map((q) => q.id) } },
		})
	}

	log.info(TAG, "archiveExistingDocument complete", {
		examPaperId,
		documentType,
	})

	return { ok: true }
}

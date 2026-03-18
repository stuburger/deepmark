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
}): Promise<CreatePdfIngestionUploadResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	if (!input.exam_board.trim())
		return { ok: false, error: "Exam board is required" }
	if (!input.subject) {
		return { ok: false, error: "Subject is required" }
	}

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
				question_id: questions[i]!.id,
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
	detected_exam_paper_metadata: unknown
	error: string | null
	created_at: Date
	processed_at: Date | null
	question_count: number
	exemplar_count: number
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
			_count: { select: { created_questions: true, exemplars: true } },
		},
	})
	if (!job) return { ok: false, error: "Job not found" }
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
			detected_exam_paper_metadata: job.detected_exam_paper_metadata,
			error: job.error,
			created_at: job.created_at,
			processed_at: job.processed_at,
			question_count: job._count.created_questions,
			exemplar_count: job._count.exemplars,
		},
	}
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

export async function retriggerPdfIngestionJob(
	jobId: string,
): Promise<RetriggerPdfIngestionJobResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const job = await db.pdfIngestionJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
	})
	if (!job) return { ok: false, error: "Job not found" }
	const terminal = ["failed", "ocr_complete"]
	if (!terminal.includes(job.status)) {
		return {
			ok: false,
			error: "Job can only be retriggered when failed or completed",
		}
	}

	await db.pdfIngestionJob.update({
		where: { id: jobId },
		data: { status: "pending", error: null },
	})
	const queueUrl =
		job.document_type === "mark_scheme"
			? Resource.MarkSchemePdfQueue.url
			: job.document_type === "question_paper"
				? Resource.QuestionPaperQueue.url
				: job.document_type === "student_paper"
					? Resource.StudentPaperQueue.url
					: Resource.ExemplarQueue.url
	await sqs.send(
		new SendMessageCommand({
			QueueUrl: queueUrl,
			MessageBody: JSON.stringify({ job_id: jobId }),
		}),
	)
	return { ok: true }
}

"use server"

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../auth"
import { log } from "../logger"

const TAG = "pdf-ingestion-actions"
const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})
const sqs = new SQSClient({})
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

export type GetPdfIngestionJobStatusResult =
	| {
			ok: true
			status: string
			error: string | null
			detected_exam_paper_metadata: unknown
			auto_create_exam_paper: boolean
	  }
	| { ok: false; error: string }

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

export type GetPdfDownloadUrlResult =
	| { ok: true; url: string }
	| { ok: false; error: string }

export type RetriggerPdfIngestionJobResult =
	| { ok: true }
	| { ok: false; error: string }

export type CancelPdfIngestionJobResult =
	| { ok: true }
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

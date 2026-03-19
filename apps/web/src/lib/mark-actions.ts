"use server"

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "./auth"
import { log } from "./logger"

const TAG = "mark-actions"

const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})
const sqs = new SQSClient({})
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

export type GradingResult = {
	question_id: string
	question_text: string
	question_number: string
	student_answer: string
	awarded_score: number
	max_score: number
	llm_reasoning: string
	feedback_summary: string
	level_awarded?: number
}

// ─── Create job ───────────────────────────────────────────────────────────────

export type CreateStudentPaperJobResult =
	| { ok: true; jobId: string }
	| { ok: false; error: string }

/**
 * Creates a new student paper job without requiring an exam paper upfront.
 * Pages are added separately via addPageToJob.
 */
export async function createStudentPaperJob(): Promise<CreateStudentPaperJobResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	log.info(TAG, "createStudentPaperJob called", { userId: session.userId })

	const job = await db.pdfIngestionJob.create({
		data: {
			document_type: "student_paper",
			s3_key: "",
			s3_bucket: bucketName,
			status: "pending",
			uploaded_by: session.userId,
			exam_board: "Unknown",
			pages: [],
		},
	})

	log.info(TAG, "Student paper job created", {
		userId: session.userId,
		jobId: job.id,
	})
	return { ok: true, jobId: job.id }
}

// ─── Add page ─────────────────────────────────────────────────────────────────

export type AddPageToJobResult =
	| { ok: true; uploadUrl: string; key: string }
	| { ok: false; error: string }

/**
 * Generates a presigned S3 PUT URL for one page of a student submission.
 * The caller uploads the file directly to S3, then the key is stored on the job.
 */
export async function addPageToJob(
	jobId: string,
	order: number,
	mimeType: string,
): Promise<AddPageToJobResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const job = await db.pdfIngestionJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
	})
	if (!job) return { ok: false, error: "Job not found" }

	const ext =
		mimeType === "application/pdf" ? "pdf" : (mimeType.split("/")[1] ?? "jpg")
	const paddedOrder = String(order).padStart(3, "0")
	const key = `pdfs/student-papers/${jobId}/page-${paddedOrder}.${ext}`

	const command = new PutObjectCommand({
		Bucket: bucketName,
		Key: key,
		ContentType: mimeType,
	})
	const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 })

	type PageEntry = { key: string; order: number; mime_type: string }
	const existingPages = (job.pages ?? []) as PageEntry[]
	const updatedPages: PageEntry[] = [
		...existingPages.filter((p) => p.order !== order),
		{ key, order, mime_type: mimeType },
	].sort((a, b) => a.order - b.order)

	await db.pdfIngestionJob.update({
		where: { id: jobId },
		data: { pages: updatedPages, s3_key: key },
	})

	log.info(TAG, "Page added to job", {
		userId: session.userId,
		jobId,
		order,
		key,
	})
	return { ok: true, uploadUrl, key }
}

// ─── Remove page ─────────────────────────────────────────────────────────────

export type RemovePageFromJobResult =
	| { ok: true }
	| { ok: false; error: string }

export async function removePageFromJob(
	jobId: string,
	order: number,
): Promise<RemovePageFromJobResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const job = await db.pdfIngestionJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
	})
	if (!job) return { ok: false, error: "Job not found" }

	type PageEntry = { key: string; order: number; mime_type: string }
	const existingPages = (job.pages ?? []) as PageEntry[]
	const updatedPages = existingPages.filter((p) => p.order !== order)

	await db.pdfIngestionJob.update({
		where: { id: jobId },
		data: { pages: updatedPages },
	})

	return { ok: true }
}

// ─── Reorder pages ────────────────────────────────────────────────────────────

export type ReorderPagesResult = { ok: true } | { ok: false; error: string }

/**
 * Saves a new page order. orderedKeys is the array of S3 keys in new order.
 */
export async function reorderPages(
	jobId: string,
	orderedKeys: string[],
): Promise<ReorderPagesResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const job = await db.pdfIngestionJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
	})
	if (!job) return { ok: false, error: "Job not found" }

	type PageEntry = { key: string; order: number; mime_type: string }
	const existingPages = (job.pages ?? []) as PageEntry[]
	const byKey = new Map(existingPages.map((p) => [p.key, p]))

	const reordered: PageEntry[] = orderedKeys
		.map((key, idx) => {
			const existing = byKey.get(key)
			if (!existing) return null
			return { ...existing, order: idx + 1 }
		})
		.filter((p): p is PageEntry => p !== null)

	await db.pdfIngestionJob.update({
		where: { id: jobId },
		data: { pages: reordered },
	})

	return { ok: true }
}

// ─── Trigger OCR ──────────────────────────────────────────────────────────────

export type TriggerOcrResult = { ok: true } | { ok: false; error: string }

/**
 * Enqueues the job for OCR text extraction. No exam paper needed yet.
 */
export async function triggerOcr(jobId: string): Promise<TriggerOcrResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const job = await db.pdfIngestionJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
	})
	if (!job) return { ok: false, error: "Job not found" }

	type PageEntry = { key: string; order: number; mime_type: string }
	const pages = (job.pages ?? []) as PageEntry[]
	if (pages.length === 0) {
		return { ok: false, error: "No pages uploaded yet" }
	}

	await db.pdfIngestionJob.update({
		where: { id: jobId },
		data: { status: "pending" },
	})

	await sqs.send(
		new SendMessageCommand({
			QueueUrl: Resource.StudentPaperOcrQueue.url,
			MessageBody: JSON.stringify({ job_id: jobId }),
		}),
	)

	log.info(TAG, "OCR triggered", { userId: session.userId, jobId })
	return { ok: true }
}

// ─── Trigger grading ──────────────────────────────────────────────────────────

export type TriggerGradingResult = { ok: true } | { ok: false; error: string }

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

	const job = await db.pdfIngestionJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
	})
	if (!job) return { ok: false, error: "Job not found" }

	if (!job.extracted_answers_raw) {
		return { ok: false, error: "OCR must complete before marking" }
	}

	const examPaper = await db.examPaper.findFirst({
		where: { id: examPaperId, is_active: true },
		select: { id: true, exam_board: true, subject: true, year: true },
	})
	if (!examPaper) return { ok: false, error: "Exam paper not found" }

	await db.pdfIngestionJob.update({
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

	log.info(TAG, "Grading triggered", {
		userId: session.userId,
		jobId,
		examPaperId,
	})
	return { ok: true }
}

// ─── Poll job status ──────────────────────────────────────────────────────────

export type StudentPaperJobPayload = {
	status: string
	error: string | null
	student_name: string | null
	detected_subject: string | null
	pages_count: number
	grading_results: GradingResult[]
	exam_paper_title: string | null
	exam_paper_id: string | null
	total_awarded: number
	total_max: number
	created_at: Date
}

export type GetStudentPaperJobResult =
	| { ok: true; data: StudentPaperJobPayload }
	| { ok: false; error: string }

export async function getStudentPaperJob(
	jobId: string,
): Promise<GetStudentPaperJobResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const job = await db.pdfIngestionJob.findFirst({
		where: {
			id: jobId,
			uploaded_by: session.userId,
			document_type: "student_paper",
		},
		include: { exam_paper: { select: { id: true, title: true } } },
	})
	if (!job) return { ok: false, error: "Job not found" }

	type PageEntry = { key: string; order: number; mime_type: string }
	const pages = (job.pages ?? []) as PageEntry[]
	const rawResults = (job.grading_results ?? []) as GradingResult[]
	const totalAwarded = rawResults.reduce((s, r) => s + r.awarded_score, 0)
	const totalMax = rawResults.reduce((s, r) => s + r.max_score, 0)

	return {
		ok: true,
		data: {
			status: job.status,
			error: job.error,
			student_name: job.student_name,
			detected_subject: job.detected_subject,
			pages_count: pages.length,
			grading_results: rawResults,
			exam_paper_title: job.exam_paper?.title ?? null,
			exam_paper_id: job.exam_paper_id,
			total_awarded: totalAwarded,
			total_max: totalMax,
			created_at: job.created_at,
		},
	}
}

// Keep legacy alias for existing result page compatibility
export const getStudentPaperResult = getStudentPaperJob

export type StudentPaperResultPayload = StudentPaperJobPayload

// ─── Update student name ──────────────────────────────────────────────────────

export type UpdateStudentNameResult =
	| { ok: true }
	| { ok: false; error: string }

export async function updateStudentName(
	jobId: string,
	name: string,
): Promise<UpdateStudentNameResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const job = await db.pdfIngestionJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
	})
	if (!job) return { ok: false, error: "Job not found" }
	await db.pdfIngestionJob.update({
		where: { id: jobId },
		data: { student_name: name },
	})
	return { ok: true }
}

// ─── Submission history ────────────────────────────────────────────────────────

export type SubmissionHistoryItem = {
	id: string
	student_name: string | null
	exam_paper_id: string | null
	exam_paper_title: string | null
	detected_subject: string | null
	total_awarded: number
	total_max: number
	status: string
	created_at: Date
}

export type ListMySubmissionsResult =
	| { ok: true; submissions: SubmissionHistoryItem[] }
	| { ok: false; error: string }

export async function listMySubmissions(): Promise<ListMySubmissionsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const jobs = await db.pdfIngestionJob.findMany({
		where: { uploaded_by: session.userId, document_type: "student_paper" },
		orderBy: { created_at: "desc" },
		include: { exam_paper: { select: { id: true, title: true } } },
	})

	return {
		ok: true,
		submissions: jobs.map((job) => {
			const results = (job.grading_results ?? []) as GradingResult[]
			return {
				id: job.id,
				student_name: job.student_name,
				exam_paper_id: job.exam_paper_id,
				exam_paper_title: job.exam_paper?.title ?? null,
				detected_subject: job.detected_subject,
				total_awarded: results.reduce((s, r) => s + r.awarded_score, 0),
				total_max: results.reduce((s, r) => s + r.max_score, 0),
				status: job.status,
				created_at: job.created_at,
			}
		}),
	}
}

// ─── Per-paper stats ──────────────────────────────────────────────────────────

export type QuestionStat = {
	question_id: string
	question_text: string
	question_number: string
	max_score: number
	avg_awarded: number
	avg_percent: number
	submission_count: number
}

export type ExamPaperStats = {
	exam_paper_id: string
	exam_paper_title: string
	submission_count: number
	avg_total_percent: number
	question_stats: QuestionStat[]
}

export type GetExamPaperStatsResult =
	| { ok: true; stats: ExamPaperStats }
	| { ok: false; error: string }

export async function getExamPaperStats(
	examPaperId: string,
): Promise<GetExamPaperStatsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const jobs = await db.pdfIngestionJob.findMany({
		where: {
			uploaded_by: session.userId,
			document_type: "student_paper",
			exam_paper_id: examPaperId,
			status: "ocr_complete",
		},
		include: { exam_paper: { select: { title: true } } },
	})

	if (jobs.length === 0) {
		const paper = await db.examPaper.findUnique({
			where: { id: examPaperId },
			select: { title: true },
		})
		return {
			ok: true,
			stats: {
				exam_paper_id: examPaperId,
				exam_paper_title: paper?.title ?? "Unknown",
				submission_count: 0,
				avg_total_percent: 0,
				question_stats: [],
			},
		}
	}

	const allResults = jobs.flatMap(
		(j) => (j.grading_results ?? []) as GradingResult[],
	)

	const byQuestion = new Map<string, GradingResult[]>()
	for (const r of allResults) {
		const existing = byQuestion.get(r.question_id) ?? []
		existing.push(r)
		byQuestion.set(r.question_id, existing)
	}

	const questionStats: QuestionStat[] = []
	for (const [questionId, results] of byQuestion) {
		const first = results[0]
		if (!first) continue
		const avgAwarded =
			results.reduce((s, r) => s + r.awarded_score, 0) / results.length
		const avgPercent =
			first.max_score > 0 ? Math.round((avgAwarded / first.max_score) * 100) : 0
		questionStats.push({
			question_id: questionId,
			question_text: first.question_text,
			question_number: first.question_number,
			max_score: first.max_score,
			avg_awarded: Math.round(avgAwarded * 10) / 10,
			avg_percent: avgPercent,
			submission_count: results.length,
		})
	}
	questionStats.sort(
		(a, b) =>
			Number.parseInt(a.question_number) - Number.parseInt(b.question_number),
	)

	const allTotals = jobs.map((j) => {
		const results = (j.grading_results ?? []) as GradingResult[]
		const awarded = results.reduce((s, r) => s + r.awarded_score, 0)
		const max = results.reduce((s, r) => s + r.max_score, 0)
		return max > 0 ? (awarded / max) * 100 : 0
	})
	const avgTotalPercent =
		allTotals.length > 0
			? Math.round(allTotals.reduce((s, v) => s + v, 0) / allTotals.length)
			: 0

	return {
		ok: true,
		stats: {
			exam_paper_id: examPaperId,
			exam_paper_title: jobs[0]?.exam_paper?.title ?? "Unknown",
			submission_count: jobs.length,
			avg_total_percent: avgTotalPercent,
			question_stats: questionStats,
		},
	}
}

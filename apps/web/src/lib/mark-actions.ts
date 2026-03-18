"use server"

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "./auth"
import { log } from "./logger"

const TAG = "mark-actions"

const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})
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

// ─── Upload ───────────────────────────────────────────────────────────────────

export type CreateStudentPaperUploadResult =
	| { ok: true; jobId: string; url: string }
	| { ok: false; error: string }

export async function createStudentPaperUpload(
	examPaperId: string,
): Promise<CreateStudentPaperUploadResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	log.info(TAG, "createStudentPaperUpload called", {
		userId: session.userId,
		examPaperId,
	})

	const examPaper = await db.examPaper.findFirst({
		where: { id: examPaperId, is_active: true },
		select: { id: true, exam_board: true, subject: true, year: true },
	})
	if (!examPaper) {
		log.warn(TAG, "Exam paper not found", { examPaperId })
		return { ok: false, error: "Exam paper not found" }
	}

	const job = await db.pdfIngestionJob.create({
		data: {
			document_type: "student_paper",
			s3_key: "",
			s3_bucket: bucketName,
			status: "pending",
			uploaded_by: session.userId,
			exam_board: examPaper.exam_board ?? "Other",
			subject: examPaper.subject,
			year: examPaper.year,
			exam_paper_id: examPaperId,
			auto_create_exam_paper: false,
		},
	})

	const key = `pdfs/student-papers/${job.id}/document.pdf`
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
	log.info(TAG, "Student paper upload job created", {
		userId: session.userId,
		jobId: job.id,
		examPaperId,
		key,
	})
	return { ok: true, jobId: job.id, url }
}

// ─── Poll result ──────────────────────────────────────────────────────────────

export type StudentPaperResultPayload = {
	status: string
	error: string | null
	student_name: string | null
	grading_results: GradingResult[]
	exam_paper_title: string
	exam_paper_id: string
	total_awarded: number
	total_max: number
	created_at: Date
}

export type GetStudentPaperResultResult =
	| { ok: true; data: StudentPaperResultPayload }
	| { ok: false; error: string }

export async function getStudentPaperResult(
	jobId: string,
): Promise<GetStudentPaperResultResult> {
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
	if (!job) {
		log.warn(TAG, "getStudentPaperResult — job not found", {
			jobId,
			userId: session.userId,
		})
		return { ok: false, error: "Job not found" }
	}

	log.info(TAG, "getStudentPaperResult", {
		jobId,
		status: job.status,
		student_name: job.student_name,
	})
	const rawResults = (job.grading_results ?? []) as GradingResult[]
	const totalAwarded = rawResults.reduce((s, r) => s + r.awarded_score, 0)
	const totalMax = rawResults.reduce((s, r) => s + r.max_score, 0)

	return {
		ok: true,
		data: {
			status: job.status,
			error: job.error,
			student_name: job.student_name,
			grading_results: rawResults,
			exam_paper_title: job.exam_paper?.title ?? "Unknown paper",
			exam_paper_id: job.exam_paper_id ?? "",
			total_awarded: totalAwarded,
			total_max: totalMax,
			created_at: job.created_at,
		},
	}
}

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

// ─── History (Phase 3) ────────────────────────────────────────────────────────

export type SubmissionHistoryItem = {
	id: string
	student_name: string | null
	exam_paper_id: string | null
	exam_paper_title: string | null
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
				total_awarded: results.reduce((s, r) => s + r.awarded_score, 0),
				total_max: results.reduce((s, r) => s + r.max_score, 0),
				status: job.status,
				created_at: job.created_at,
			}
		}),
	}
}

// ─── Per-paper stats (Phase 3) ────────────────────────────────────────────────

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

	// Group by question_id
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

"use server"

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import {
	type EnrichmentStatus,
	type GradingStatus,
	type JobEvent,
	type OcrStatus,
	createPrismaClient,
} from "@mcp-gcse/db"
import { parseAnnotationPayload } from "@mcp-gcse/shared"
import { Resource } from "sst"
import { auth } from "../auth"
import { deriveScanStatus } from "./status"
import type { HandwritingAnalysis, PageToken } from "./types"
import type {
	AnnotationPayload,
	AnswerRegion,
	ExtractedAnswer,
	GetExamPaperStatsResult,
	GetJobAnnotationsResult,
	GetJobPageTokensResult,
	GetJobScanPageUrlsResult,
	GetStudentPaperJobResult,
	GradingResult,
	ListMySubmissionsResult,
	OverlayType,
	StudentPaperAnnotation,
} from "./types"

const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

// ─── Region helpers ───────────────────────────────────────────────────────────

type RegionRow = {
	question_id: string
	page_order: number
	box: unknown
	source: string | null
}

/**
 * Builds a question_id → AnswerRegion[] map from rows in
 * student_paper_answer_regions, then merges it into the raw grading results
 * so all downstream components see the same shape as before.
 */
function mergeRegionsIntoResults(
	rawResults: GradingResult[],
	regionRows: RegionRow[],
): GradingResult[] {
	const byQuestion = new Map<string, AnswerRegion[]>()
	for (const row of regionRows) {
		const existing = byQuestion.get(row.question_id) ?? []
		existing.push({
			page: row.page_order,
			box: row.box as [number, number, number, number],
			source: row.source,
		})
		byQuestion.set(row.question_id, existing)
	}
	return rawResults.map((r) => ({
		...r,
		answer_regions: byQuestion.get(r.question_id) ?? [],
	}))
}

// ─── Shared include for submission detail queries ───────────────────────────

const submissionDetailInclude = {
	exam_paper: {
		select: { id: true, title: true, level_descriptors: true },
	},
	answer_regions: {
		select: {
			question_id: true,
			page_order: true,
			box: true,
			source: true,
		},
	},
	ocr_runs: {
		orderBy: { created_at: "desc" as const },
		take: 1,
		select: {
			id: true,
			status: true,
			error: true,
			extracted_answers_raw: true,
			page_analyses: true,
			job_events: true,
		},
	},
	grading_runs: {
		orderBy: { created_at: "desc" as const },
		take: 1,
		select: {
			id: true,
			status: true,
			error: true,
			grading_results: true,
			job_events: true,
			enrichment_runs: {
				orderBy: { created_at: "desc" as const },
				take: 1,
				select: { id: true, status: true },
			},
		},
	},
} as const

type PageEntry = { key: string; order: number; mime_type: string }
type RawExtracted = {
	student_name?: string | null
	answers?: ExtractedAnswer[]
}

/**
 * Maps a StudentSubmission (with included runs) to the legacy
 * StudentPaperJobPayload shape consumed by the UI.
 */
function toJobPayload(
	sub: {
		id: string
		student_name: string | null
		student_id: string | null
		detected_subject: string | null
		pages: unknown
		exam_paper_id: string
		created_at: Date
		exam_paper: { id: string; title: string; level_descriptors: string | null } | null
		answer_regions: RegionRow[]
		ocr_runs: Array<{
			id: string
			status: OcrStatus
			error: string | null
			extracted_answers_raw: unknown
			page_analyses: unknown
			job_events: unknown
		}>
		grading_runs: Array<{
			id: string
			status: GradingStatus
			error: string | null
			grading_results: unknown
			job_events: unknown
			enrichment_runs: Array<{ id: string; status: EnrichmentStatus }>
		}>
	},
) {
	const latestOcr = sub.ocr_runs[0] ?? null
	const latestGrading = sub.grading_runs[0] ?? null
	const latestEnrichment = latestGrading?.enrichment_runs[0] ?? null

	const status = deriveScanStatus(
		latestOcr?.status ?? null,
		latestGrading?.status ?? null,
	)
	const error = latestGrading?.error ?? latestOcr?.error ?? null

	const pages = (sub.pages ?? []) as PageEntry[]
	const rawResults = (latestGrading?.grading_results ?? []) as GradingResult[]
	const gradingResults = mergeRegionsIntoResults(rawResults, sub.answer_regions)
	const totalAwarded = gradingResults.reduce((s, r) => s + r.awarded_score, 0)
	const totalMax = gradingResults.reduce((s, r) => s + r.max_score, 0)
	const rawExtracted = latestOcr?.extracted_answers_raw as RawExtracted | null
	const extractedAnswers = rawExtracted?.answers ?? null

	// Merge job events from both runs, sorted by timestamp
	const ocrEvents = (latestOcr?.job_events as JobEvent[] | null) ?? []
	const gradingEvents = (latestGrading?.job_events as JobEvent[] | null) ?? []
	const allEvents = [...ocrEvents, ...gradingEvents].sort((a, b) =>
		a.at < b.at ? -1 : a.at > b.at ? 1 : 0,
	)

	return {
		status,
		error,
		student_name: sub.student_name,
		student_id: sub.student_id,
		detected_subject: sub.detected_subject,
		pages_count: pages.length,
		grading_results: gradingResults,
		exam_paper_title: sub.exam_paper?.title ?? null,
		exam_paper_id: sub.exam_paper_id,
		total_awarded: totalAwarded,
		total_max: totalMax,
		created_at: sub.created_at,
		extracted_answers: extractedAnswers,
		job_events: allEvents.length > 0 ? allEvents : null,
		enrichment_status: latestEnrichment?.status ?? null,
		level_descriptors: sub.exam_paper?.level_descriptors ?? null,
		submission_id: sub.id,
		ocr_run_id: latestOcr?.id,
		grading_run_id: latestGrading?.id,
		enrichment_run_id: latestEnrichment?.id,
	}
}

// ─── getStudentPaperJob ─────────────────────────────────────────────────────

export async function getStudentPaperJob(
	jobId: string,
): Promise<GetStudentPaperJobResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const sub = await db.studentSubmission.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
		include: submissionDetailInclude,
	})
	if (!sub) return { ok: false, error: "Job not found" }

	return { ok: true, data: toJobPayload(sub) }
}

// Keep legacy alias for existing result page compatibility
export const getStudentPaperResult = getStudentPaperJob

/**
 * Fetches a student paper job while validating it belongs to the given exam paper.
 * Used by the new /papers/[examPaperId]/submissions/[jobId] route to provide
 * a security invariant that the job is from the expected paper context.
 */
export async function getStudentPaperJobForPaper(
	examPaperId: string,
	jobId: string,
): Promise<GetStudentPaperJobResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const sub = await db.studentSubmission.findFirst({
		where: {
			id: jobId,
			exam_paper_id: examPaperId,
			uploaded_by: session.userId,
		},
		include: submissionDetailInclude,
	})
	if (!sub) return { ok: false, error: "Job not found" }

	return { ok: true, data: toJobPayload(sub) }
}

// ─── getJobScanPageUrls ─────────────────────────────────────────────────────

/**
 * Returns short-lived presigned GET URLs for every page uploaded to a job,
 * merged with the stored per-page OCR analysis where available.
 */
export async function getJobScanPageUrls(
	jobId: string,
): Promise<GetJobScanPageUrlsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const sub = await db.studentSubmission.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
		select: {
			pages: true,
			s3_bucket: true,
			ocr_runs: {
				orderBy: { created_at: "desc" },
				take: 1,
				select: { page_analyses: true },
			},
		},
	})
	if (!sub) return { ok: false, error: "Job not found" }

	const pages = (sub.pages ?? []) as PageEntry[]
	if (pages.length === 0) return { ok: true, pages: [] }

	type PageAnalysisEntry = {
		page: number
		transcript: string
		observations: string[]
	}
	const latestOcr = sub.ocr_runs[0]
	const analyses = (latestOcr?.page_analyses ?? []) as PageAnalysisEntry[]
	const analysisByPage = new Map(
		analyses.map((a) => [
			a.page,
			{
				transcript: a.transcript,
				observations: a.observations,
			} satisfies HandwritingAnalysis,
		]),
	)

	const bucket = sub.s3_bucket || bucketName

	const resolved = await Promise.all(
		pages
			.slice()
			.sort((a, b) => a.order - b.order)
			.map(async (p) => {
				const cmd = new GetObjectCommand({ Bucket: bucket, Key: p.key })
				const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 })
				return {
					order: p.order,
					url,
					mimeType: p.mime_type,
					analysis: analysisByPage.get(p.order),
				}
			}),
	)

	return { ok: true, pages: resolved }
}

// ─── getJobPageTokens ───────────────────────────────────────────────────────

/**
 * Returns all Cloud Vision word-level tokens for a job as a flat array,
 * ordered by page_order → para_index → line_index → word_index.
 * Callers filter by page_order as needed.
 */
export async function getJobPageTokens(
	jobId: string,
): Promise<GetJobPageTokensResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const sub = await db.studentSubmission.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
		select: { id: true },
	})
	if (!sub) return { ok: false, error: "Job not found" }

	const rows = await db.studentPaperPageToken.findMany({
		where: { submission_id: jobId },
		orderBy: [
			{ page_order: "asc" },
			{ para_index: "asc" },
			{ line_index: "asc" },
			{ word_index: "asc" },
		],
		select: {
			id: true,
			page_order: true,
			para_index: true,
			line_index: true,
			word_index: true,
			text_raw: true,
			text_corrected: true,
			bbox: true,
			confidence: true,
		},
	})

	const tokens: PageToken[] = rows.map((row) => ({
		id: row.id,
		page_order: row.page_order,
		para_index: row.para_index,
		line_index: row.line_index,
		word_index: row.word_index,
		text_raw: row.text_raw,
		text_corrected: row.text_corrected,
		bbox: row.bbox as [number, number, number, number],
		confidence: row.confidence,
	}))

	return { ok: true, tokens }
}

// ─── List queries ───────────────────────────────────────────────────────────

export async function listMySubmissions(): Promise<ListMySubmissionsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const subs = await db.studentSubmission.findMany({
		where: { uploaded_by: session.userId, superseded_at: null },
		orderBy: { created_at: "desc" },
		include: {
			exam_paper: { select: { id: true, title: true } },
			grading_runs: {
				orderBy: { created_at: "desc" },
				take: 1,
				select: { status: true, grading_results: true },
			},
			ocr_runs: {
				orderBy: { created_at: "desc" },
				take: 1,
				select: { status: true },
			},
		},
	})

	return {
		ok: true,
		submissions: subs.map((sub) => {
			const latestGrading = sub.grading_runs[0]
			const latestOcr = sub.ocr_runs[0]
			const results = (latestGrading?.grading_results ?? []) as GradingResult[]
			const status = deriveScanStatus(
				latestOcr?.status ?? null,
				latestGrading?.status ?? null,
			)
			return {
				id: sub.id,
				student_name: sub.student_name,
				exam_paper_id: sub.exam_paper_id,
				exam_paper_title: sub.exam_paper?.title ?? null,
				detected_subject: sub.detected_subject,
				total_awarded: results.reduce((s, r) => s + r.awarded_score, 0),
				total_max: results.reduce((s, r) => s + r.max_score, 0),
				status,
				created_at: sub.created_at,
			}
		}),
	}
}

export async function listSubmissionsForPaper(
	examPaperId: string,
): Promise<ListMySubmissionsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const subs = await db.studentSubmission.findMany({
		where: {
			uploaded_by: session.userId,
			exam_paper_id: examPaperId,
			superseded_at: null,
		},
		orderBy: { created_at: "desc" },
		include: {
			exam_paper: { select: { id: true, title: true } },
			grading_runs: {
				orderBy: { created_at: "desc" },
				take: 1,
				select: { status: true, grading_results: true },
			},
			ocr_runs: {
				orderBy: { created_at: "desc" },
				take: 1,
				select: { status: true },
			},
		},
	})

	return {
		ok: true,
		submissions: subs.map((sub) => {
			const latestGrading = sub.grading_runs[0]
			const latestOcr = sub.ocr_runs[0]
			const results = (latestGrading?.grading_results ?? []) as GradingResult[]
			const status = deriveScanStatus(
				latestOcr?.status ?? null,
				latestGrading?.status ?? null,
			)
			return {
				id: sub.id,
				student_name: sub.student_name,
				exam_paper_id: sub.exam_paper_id,
				exam_paper_title: sub.exam_paper?.title ?? null,
				detected_subject: sub.detected_subject,
				total_awarded: results.reduce((s, r) => s + r.awarded_score, 0),
				total_max: results.reduce((s, r) => s + r.max_score, 0),
				status,
				created_at: sub.created_at,
			}
		}),
	}
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export async function getExamPaperStats(
	examPaperId: string,
): Promise<GetExamPaperStatsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	// Find submissions with a completed grading run
	const subs = await db.studentSubmission.findMany({
		where: {
			uploaded_by: session.userId,
			exam_paper_id: examPaperId,
			superseded_at: null,
			grading_runs: {
				some: { status: "complete" },
			},
		},
		include: {
			exam_paper: { select: { title: true } },
			grading_runs: {
				where: { status: "complete" },
				orderBy: { created_at: "desc" },
				take: 1,
				select: { grading_results: true },
			},
		},
	})

	if (subs.length === 0) {
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

	const allResults = subs.flatMap(
		(s) => (s.grading_runs[0]?.grading_results ?? []) as GradingResult[],
	)

	const byQuestion = new Map<string, GradingResult[]>()
	for (const r of allResults) {
		const existing = byQuestion.get(r.question_id) ?? []
		existing.push(r)
		byQuestion.set(r.question_id, existing)
	}

	const questionStats = []
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

	const allTotals = subs.map((s) => {
		const results = (s.grading_runs[0]?.grading_results ?? []) as GradingResult[]
		const awarded = results.reduce((sum, r) => sum + r.awarded_score, 0)
		const max = results.reduce((sum, r) => sum + r.max_score, 0)
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
			exam_paper_title: subs[0]?.exam_paper?.title ?? "Unknown",
			submission_count: subs.length,
			avg_total_percent: avgTotalPercent,
			question_stats: questionStats,
		},
	}
}

// ─── Annotations ─────────────────────────────────────────────────────────────

export async function getJobAnnotations(
	jobId: string,
): Promise<GetJobAnnotationsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const sub = await db.studentSubmission.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
		select: { id: true },
	})
	if (!sub) return { ok: false, error: "Job not found" }

	// Find the latest enrichment run and its annotations
	const latestEnrichmentRun = await db.enrichmentRun.findFirst({
		where: { grading_run_id: jobId },
		orderBy: { created_at: "desc" },
		select: { id: true },
	})

	if (!latestEnrichmentRun) return { ok: true, annotations: [] }

	const rows = await db.studentPaperAnnotation.findMany({
		where: { enrichment_run_id: latestEnrichmentRun.id },
		orderBy: [{ page_order: "asc" }, { sort_order: "asc" }],
	})

	const annotations: StudentPaperAnnotation[] = rows.map((row) => {
		let payload: AnnotationPayload
		try {
			payload = parseAnnotationPayload(
				row.overlay_type as OverlayType,
				row.payload,
			)
		} catch {
			// Fallback for unparseable payloads — should not happen but be resilient
			payload = { _v: 1, text: "" } as AnnotationPayload
		}

		return {
			id: row.id,
			enrichment_run_id: row.enrichment_run_id,
			question_id: row.question_id,
			page_order: row.page_order,
			overlay_type: row.overlay_type as OverlayType,
			sentiment: row.sentiment,
			payload,
			bbox: row.bbox as [number, number, number, number],
			parent_annotation_id: row.parent_annotation_id,
		}
	})

	return { ok: true, annotations }
}

"use server"

import {
	type EnrichmentStatus,
	type GradingStatus,
	type JobEvent,
	type OcrStatus,
	createPrismaClient,
} from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../../auth"
import { deriveScanStatus } from "../status"
import type {
	AnswerRegion,
	ExtractedAnswer,
	GetStudentPaperJobResult,
	GradingResult,
} from "../types"

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
function toJobPayload(sub: {
	id: string
	student_name: string | null
	student_id: string | null
	detected_subject: string | null
	pages: unknown
	exam_paper_id: string
	created_at: Date
	exam_paper: {
		id: string
		title: string
		level_descriptors: string | null
	} | null
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
}) {
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
		where: { id: jobId },
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
		},
		include: submissionDetailInclude,
	})
	if (!sub) return { ok: false, error: "Job not found" }

	return { ok: true, data: toJobPayload(sub) }
}

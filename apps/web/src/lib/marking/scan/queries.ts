"use server"

import { db } from "@/lib/db"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { Resource } from "sst"
import { auth } from "../../auth"
import type {
	GetJobPageTokensResult,
	GetJobScanPageUrlsResult,
	HandwritingAnalysis,
	PageToken,
} from "../types"

const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})

type PageEntry = { key: string; order: number; mime_type: string }

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
		where: { id: jobId },
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
		where: { id: jobId },
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
			question_id: true,
			answer_char_start: true,
			answer_char_end: true,
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
		question_id: row.question_id,
		answer_char_start: row.answer_char_start,
		answer_char_end: row.answer_char_end,
	}))

	return { ok: true, tokens }
}

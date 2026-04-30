"use server"

import { resourceAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { sortTokensSpatially } from "@mcp-gcse/shared"
import { z } from "zod"
import type { HandwritingAnalysis, PageToken, ScanPage } from "../types"

type PageEntry = { key: string; order: number; mime_type: string }

const jobIdInput = z.object({ jobId: z.string() })

// ─── getJobScanPages ────────────────────────────────────────────────────────

/**
 * Returns every page uploaded to a job (S3 key + mime type), merged with the
 * stored per-page OCR analysis where available. Clients build the download
 * URL via submission-scoped scan routes — no presigned URLs are handed out.
 */
export const getJobScanPages = resourceAction({
	type: "submission",
	role: "viewer",
	schema: jobIdInput,
	id: ({ jobId }) => jobId,
}).action(async ({ parsedInput: { jobId } }) => {
	const sub = await db.studentSubmission.findFirst({
		where: { id: jobId },
		select: {
			pages: true,
			ocr_runs: {
				orderBy: { created_at: "desc" },
				take: 1,
				select: { page_analyses: true },
			},
		},
	})
	if (!sub) return { pages: [] as ScanPage[] }

	const pages = (sub.pages ?? []) as PageEntry[]
	if (pages.length === 0) return { pages: [] as ScanPage[] }

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

	return { pages: shapePages(pages, analysisByPage) }
})

function shapePages(
	pages: PageEntry[],
	analysisByPage: Map<number, HandwritingAnalysis>,
): ScanPage[] {
	return pages
		.slice()
		.sort((a, b) => a.order - b.order)
		.map((p) => ({
			order: p.order,
			key: p.key,
			mimeType: p.mime_type,
			analysis: analysisByPage.get(p.order),
		}))
}

// ─── getJobPageTokens ───────────────────────────────────────────────────────

/**
 * Returns all Cloud Vision word-level tokens for a job, grouped by page and
 * sorted within each page into spatial reading order (top→bottom, left→right).
 *
 * Reading order matters: `answer_text` was authored by the attribution LLM
 * in this same spatial order. Downstream alignment (`alignTokensToAnswer`)
 * walks tokens sequentially against `answer_text`, so any divergence between
 * the two orderings produces off-by-N bbox anchors on extended answers.
 * Vision's native `(para_index, line_index, word_index)` ordering breaks on
 * fragmented handwriting and is not safe to rely on for alignment.
 */
export const getJobPageTokens = resourceAction({
	type: "submission",
	role: "viewer",
	schema: jobIdInput,
	id: ({ jobId }) => jobId,
}).action(async ({ parsedInput: { jobId } }) => {
	const rows = await db.studentPaperPageToken.findMany({
		where: { submission_id: jobId },
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

	const rawTokens: PageToken[] = rows.map((row) => ({
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

	const byPage = new Map<number, PageToken[]>()
	for (const t of rawTokens) {
		const list = byPage.get(t.page_order) ?? []
		list.push(t)
		byPage.set(t.page_order, list)
	}

	const tokens: PageToken[] = Array.from(byPage.keys())
		.sort((a, b) => a - b)
		.flatMap((page) => sortTokensSpatially(byPage.get(page) ?? []))

	return { tokens }
})

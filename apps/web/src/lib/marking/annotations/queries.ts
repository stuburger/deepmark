"use server"

import { db } from "@/lib/db"
import type { Prisma } from "@mcp-gcse/db"
import { parseAnnotationPayload } from "@mcp-gcse/shared"
import { auth } from "../../auth"
import type {
	AnyAnnotationPayload,
	GetJobAnnotationsResult,
	OverlayType,
	StudentPaperAnnotation,
} from "../types"

/**
 * Loads AI annotations from the latest enrichment run plus any
 * teacher-authored rows for a submission. Returns an empty list while
 * enrichment has not yet produced any rows so callers can render the
 * text first and layer marks in progressively.
 */
export async function getJobAnnotations(
	jobId: string,
): Promise<GetJobAnnotationsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	// Resolve: jobId → latest grading_run → latest enrichment_run
	const sub = await db.studentSubmission.findFirst({
		where: { id: jobId },
		select: {
			id: true,
			grading_runs: {
				orderBy: { created_at: "desc" },
				take: 1,
				select: { id: true },
			},
		},
	})
	if (!sub) return { ok: false, error: "Job not found" }

	const latestGradingId = sub.grading_runs[0]?.id ?? null
	const latestEnrichmentRun = latestGradingId
		? await db.enrichmentRun.findFirst({
				where: { grading_run_id: latestGradingId },
				orderBy: { created_at: "desc" },
				select: { id: true },
			})
		: null

	// Load AI marks (current enrichment run) plus teacher-authored marks for
	// this submission. Filter out soft-deleted rows in both branches.
	const or: Prisma.StudentPaperAnnotationWhereInput[] = [
		{ submission_id: sub.id, source: "teacher" },
	]
	if (latestEnrichmentRun) {
		or.push({ enrichment_run_id: latestEnrichmentRun.id })
	}

	const rows = await db.studentPaperAnnotation.findMany({
		where: { deleted_at: null, OR: or },
		orderBy: [{ page_order: "asc" }, { sort_order: "asc" }],
	})

	// parseAnnotationPayload validates the overlay_type/payload pairing via Zod,
	// so the cast to StudentPaperAnnotation (discriminated union) is safe here.
	const annotations = rows.map((row) => {
		let payload: AnyAnnotationPayload
		try {
			payload = parseAnnotationPayload(
				row.overlay_type as OverlayType,
				row.payload,
			)
		} catch {
			// Fallback for unparseable payloads — should not happen but be resilient
			payload = { _v: 1, signal: "tick", reason: "" } as AnyAnnotationPayload
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
			anchor_token_start_id: row.anchor_token_start_id,
			anchor_token_end_id: row.anchor_token_end_id,
		} as StudentPaperAnnotation
	})

	return { ok: true, annotations }
}

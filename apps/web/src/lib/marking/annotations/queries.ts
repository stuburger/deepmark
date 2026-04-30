"use server"

import { resourceAction } from "@/lib/authz"
import { db } from "@/lib/db"
import type { Prisma } from "@mcp-gcse/db"
import { parseAnnotationPayload } from "@mcp-gcse/shared"
import { z } from "zod"
import type {
	AnyAnnotationPayload,
	OverlayType,
	StudentPaperAnnotation,
} from "../types"

/**
 * Loads AI annotations for the latest grading run plus any teacher-authored
 * rows for a submission. Returns an empty list while grading has not yet
 * produced any rows so callers can render the text first and layer marks in
 * progressively.
 */
export const getJobAnnotations = resourceAction({
	type: "submission",
	role: "viewer",
	schema: z.object({ jobId: z.string() }),
	id: ({ jobId }) => jobId,
}).action(
	async ({
		parsedInput: { jobId },
	}): Promise<{ annotations: StudentPaperAnnotation[] }> => {
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
		if (!sub) throw new Error("Job not found")

		const latestGradingId = sub.grading_runs[0]?.id ?? null

		const or: Prisma.StudentPaperAnnotationWhereInput[] = [
			{ submission_id: sub.id, source: "teacher" },
		]
		if (latestGradingId) {
			or.push({ grading_run_id: latestGradingId })
		}

		const rows = await db.studentPaperAnnotation.findMany({
			where: { deleted_at: null, OR: or },
			orderBy: [{ page_order: "asc" }, { sort_order: "asc" }],
		})

		const annotations = rows.map((row) => {
			let payload: AnyAnnotationPayload
			try {
				payload = parseAnnotationPayload(
					row.overlay_type as OverlayType,
					row.payload,
				)
			} catch {
				payload = { _v: 1, signal: "tick", reason: "" } as AnyAnnotationPayload
			}

			return {
				id: row.id,
				grading_run_id: row.grading_run_id,
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

		return { annotations }
	},
)

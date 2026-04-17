"use server"

import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../../auth"
import type { StudentPaperAnnotation } from "../types"
import { diffAnnotations } from "./diff"

const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

export type SaveAnnotationEditsResult =
	| { ok: true; inserted: number; updated: number; deleted: number }
	| { ok: false; error: string }

/**
 * Persists teacher edits to annotations for a submission.
 *
 * Diffs `editorState` (currently in the PM editor) against the set of
 * non-deleted annotations currently linked to the submission and applies
 * inserts, updates, and soft-deletes in a single transaction.
 *
 * Inserts are always recorded with source="teacher". Updates preserve the
 * existing source — a teacher modifying an AI mark does not flip it to
 * teacher-authored (we want to preserve the AI origin for audit). Deletes
 * are always soft — we set deleted_at rather than removing rows.
 */
export async function saveAnnotationEdits(
	jobId: string,
	editorState: StudentPaperAnnotation[],
): Promise<SaveAnnotationEditsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const submission = await db.studentSubmission.findFirst({
		where: { id: jobId },
		select: {
			id: true,
			grading_runs: {
				orderBy: { created_at: "desc" },
				take: 1,
				select: {
					enrichment_runs: {
						orderBy: { created_at: "desc" },
						take: 1,
						select: { id: true },
					},
				},
			},
		},
	})
	if (!submission) return { ok: false, error: "Submission not found" }

	const latestEnrichmentId =
		submission.grading_runs[0]?.enrichment_runs[0]?.id ?? null

	// Current active DB state: non-deleted annotations for this submission,
	// either linked to the latest enrichment run or teacher-authored.
	const dbRows = await db.studentPaperAnnotation.findMany({
		where: {
			deleted_at: null,
			OR: [
				{ submission_id: submission.id },
				latestEnrichmentId
					? { enrichment_run_id: latestEnrichmentId }
					: { id: "__never__" },
			],
		},
	})

	// The cast on the whole array is needed because TS can't prove that
	// the (overlay_type, payload) pair forms one of the discriminated-union
	// variants from the generic DB row — that invariant is enforced upstream
	// by the enrichment pipeline persisting parseable payloads.
	const dbState = dbRows.map(
		(r) =>
			({
				id: r.id,
				enrichment_run_id: r.enrichment_run_id,
				question_id: r.question_id,
				page_order: r.page_order,
				overlay_type: r.overlay_type as "annotation" | "chain",
				sentiment: r.sentiment,
				payload: r.payload as StudentPaperAnnotation["payload"],
				bbox: r.bbox as [number, number, number, number],
				anchor_token_start_id: r.anchor_token_start_id,
				anchor_token_end_id: r.anchor_token_end_id,
			}) as StudentPaperAnnotation,
	)

	const { inserts, updates, deletes } = diffAnnotations(dbState, editorState)

	await db.$transaction([
		...inserts.map((a) =>
			db.studentPaperAnnotation.create({
				data: {
					id: a.id,
					submission_id: submission.id,
					enrichment_run_id: null,
					source: "teacher",
					question_id: a.question_id,
					page_order: a.page_order,
					overlay_type: a.overlay_type,
					sentiment: a.sentiment,
					payload: a.payload,
					anchor_token_start_id: a.anchor_token_start_id,
					anchor_token_end_id: a.anchor_token_end_id,
					bbox: a.bbox,
				},
			}),
		),
		...updates.map((a) =>
			db.studentPaperAnnotation.update({
				where: { id: a.id },
				data: {
					question_id: a.question_id,
					page_order: a.page_order,
					overlay_type: a.overlay_type,
					sentiment: a.sentiment,
					payload: a.payload,
					anchor_token_start_id: a.anchor_token_start_id,
					anchor_token_end_id: a.anchor_token_end_id,
					bbox: a.bbox,
				},
			}),
		),
		...(deletes.length
			? [
					db.studentPaperAnnotation.updateMany({
						where: { id: { in: deletes } },
						data: { deleted_at: new Date() },
					}),
				]
			: []),
	])

	return {
		ok: true,
		inserted: inserts.length,
		updated: updates.length,
		deleted: deletes.length,
	}
}

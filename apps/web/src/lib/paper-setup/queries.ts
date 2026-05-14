"use server"

import { authenticatedAction } from "@/lib/authz"
import { parsePageKeys } from "@/lib/batch/types"
import { db } from "@/lib/db"
import type { StagedScriptStatus } from "@mcp-gcse/db"
import { LOW_CONFIDENCE_NUDGE_THRESHOLD } from "@mcp-gcse/shared"
import { z } from "zod"

/**
 * Facts read by the wizard live view. The view (not the query) derives the
 * panel state from these — there's no `status` column on PaperSetupSession.
 *
 *   - bundle done           ↔ examPaperId IS NOT NULL
 *   - bundle failed         ↔ error IS NOT NULL && examPaperId IS NULL
 *   - segmentation done     ↔ batch IS NULL (skipped) OR batch.status === 'staging' OR 'committed'
 *   - segmentation failed   ↔ batch.status === 'failed'
 *
 * `staging` is the segmentation-finished resting state (waiting for commit
 * click). `committed` only happens after the teacher clicks Start marking —
 * at which point the wizard has already navigated to the shell.
 *
 * Scripts are populated once the batch reaches `staging` so the wizard's
 * completed-state summary can show thumbnails + names + confidence pills
 * without triggering a second round-trip. The drag/drop dialog, when opened,
 * uses its own data fetch via useBatchIngestion.
 */
export type PaperSetupSessionFacts = {
	id: string
	createdAt: Date
	examPaperId: string | null
	error: string | null
	batch: {
		id: string
		status: "uploading" | "classifying" | "staging" | "committed" | "failed"
		error: string | null
	} | null
	scripts: Array<{
		id: string
		proposedName: string | null
		confirmedName: string | null
		status: StagedScriptStatus
		confidence: number | null
		isLowConfidence: boolean
		thumbnailUrl: string
	}>
	lowConfidenceCount: number
}

const getInput = z.object({ sessionId: z.string() })

export const getPaperSetupSession = authenticatedAction
	.inputSchema(getInput)
	.action(
		async ({
			parsedInput: { sessionId },
			ctx,
		}): Promise<{ session: PaperSetupSessionFacts | null }> => {
			const row = await db.paperSetupSession.findFirst({
				where: { id: sessionId, created_by_id: ctx.user.id },
				select: {
					id: true,
					exam_paper_id: true,
					error: true,
					created_at: true,
					batch_ingest_job: {
						select: { id: true, status: true, error: true },
					},
				},
			})
			if (!row) return { session: null }

			const segmentationReady =
				row.batch_ingest_job?.status === "staging" ||
				row.batch_ingest_job?.status === "committed"

			const scripts: PaperSetupSessionFacts["scripts"] = []
			let lowConfidenceCount = 0
			if (row.batch_ingest_job && segmentationReady) {
				const stagedScripts = await db.stagedScript.findMany({
					where: { batch_job_id: row.batch_ingest_job.id },
					select: {
						id: true,
						proposed_name: true,
						confirmed_name: true,
						status: true,
						confidence: true,
						page_keys: true,
					},
					orderBy: { created_at: "asc" },
				})
				for (const s of stagedScripts) {
					const isLowConfidence =
						s.confidence !== null &&
						s.confidence < LOW_CONFIDENCE_NUDGE_THRESHOLD
					if (isLowConfidence && s.status === "confirmed") {
						lowConfidenceCount++
					}
					const firstPageOrder =
						parsePageKeys(s.page_keys).reduce<number | null>((min, p) => {
							if (min === null || p.order < min) return p.order
							return min
						}, null) ?? 1
					scripts.push({
						id: s.id,
						proposedName: s.proposed_name,
						confirmedName: s.confirmed_name,
						status: s.status,
						confidence: s.confidence,
						isLowConfidence,
						thumbnailUrl: `/api/batch/${row.batch_ingest_job.id}/staged-scripts/${s.id}/scan-pages/${firstPageOrder}`,
					})
				}
			}

			return {
				session: {
					id: row.id,
					createdAt: row.created_at,
					examPaperId: row.exam_paper_id,
					error: row.error,
					batch: row.batch_ingest_job
						? {
								id: row.batch_ingest_job.id,
								status: row.batch_ingest_job.status,
								error: row.batch_ingest_job.error,
							}
						: null,
					scripts,
					lowConfidenceCount,
				},
			}
		},
	)

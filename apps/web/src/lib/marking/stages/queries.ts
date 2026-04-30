"use server"

import { resourceAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { z } from "zod"
import { ANNOTATION_BOOKKEEPING_SELECT } from "../selects"
import { deriveAnnotationStatus } from "../status"
import { deriveStageStatus } from "./derive"
import type { JobStages, Stage } from "./types"

/**
 * Returns explicit per-stage status for a submission.
 * jobId here is the StudentSubmission.id (same as every other job query).
 *
 * Each stage reports the status of its latest run row; absence of a row means
 * the stage has not yet started.
 */
export const getJobStages = resourceAction({
	type: "submission",
	role: "viewer",
	schema: z.object({ jobId: z.string() }),
	id: ({ jobId }) => jobId,
}).action(
	async ({ parsedInput: { jobId } }): Promise<{ stages: JobStages | null }> => {
		const submission = await db.studentSubmission.findFirst({
			where: { id: jobId },
			select: {
				id: true,
				ocr_runs: {
					orderBy: { created_at: "desc" },
					take: 1,
					select: {
						id: true,
						status: true,
						error: true,
						started_at: true,
						completed_at: true,
					},
				},
				grading_runs: {
					orderBy: { created_at: "desc" },
					take: 1,
					select: {
						id: true,
						status: true,
						error: true,
						started_at: true,
						completed_at: true,
						...ANNOTATION_BOOKKEEPING_SELECT,
					},
				},
			},
		})

		if (!submission) return { stages: null }

		const latestOcr = submission.ocr_runs[0] ?? null
		const latestGrading = submission.grading_runs[0] ?? null

		const ocr: Stage = {
			status: deriveStageStatus(latestOcr?.status ?? null),
			runId: latestOcr?.id ?? null,
			startedAt: latestOcr?.started_at ?? null,
			completedAt: latestOcr?.completed_at ?? null,
			error: latestOcr?.error ?? null,
		}

		const grading: Stage = {
			status: deriveStageStatus(latestGrading?.status ?? null),
			runId: latestGrading?.id ?? null,
			startedAt: latestGrading?.started_at ?? null,
			completedAt: latestGrading?.completed_at ?? null,
			error: latestGrading?.error ?? null,
		}

		const annotation: Stage = {
			status: deriveStageStatus(deriveAnnotationStatus(latestGrading)),
			runId: latestGrading?.id ?? null,
			startedAt: null,
			completedAt: latestGrading?.annotations_completed_at ?? null,
			error: latestGrading?.annotation_error ?? null,
		}

		const stages: JobStages = {
			jobId: submission.id,
			ocr,
			grading,
			annotation,
		}

		return { stages }
	},
)

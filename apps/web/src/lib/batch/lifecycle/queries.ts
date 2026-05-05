"use server"

import { resourceAction } from "@/lib/authz"
import { db } from "@/lib/db"
import type { BatchStatus } from "@mcp-gcse/db"
import { z } from "zod"
import { parseJobEvents } from "../events"
import { type ActiveBatchInfo, parsePageKeys } from "../types"

export const getActiveBatchForPaper = resourceAction({
	type: "examPaper",
	role: "viewer",
	schema: z.object({ examPaperId: z.string() }),
	id: ({ examPaperId }) => examPaperId,
}).action(
	async ({
		parsedInput: { examPaperId },
	}): Promise<{ batch: ActiveBatchInfo }> => {
		// "failed" is included so the UI can surface the failure to the teacher
		// instead of silently disappearing the spinner. The next successful
		// upload supersedes it via createTestBatch / triggerClassification.
		const batch = await db.batchIngestJob.findFirst({
			where: {
				exam_paper_id: examPaperId,
				status: {
					in: ["classifying", "staging", "marking", "failed"] as BatchStatus[],
				},
			},
			orderBy: { created_at: "desc" },
			include: {
				staged_scripts: { orderBy: { created_at: "asc" } },
			},
		})

		if (!batch) return { batch: null }

		return {
			batch: {
				id: batch.id,
				status: batch.status,
				total_student_jobs: batch.total_student_jobs,
				events: parseJobEvents(batch.job_events),
				staged_scripts: batch.staged_scripts.map((s) => ({
					id: s.id,
					page_keys: parsePageKeys(s.page_keys),
					proposed_name: s.proposed_name,
					confirmed_name: s.confirmed_name,
					confidence: s.confidence,
					status: s.status,
				})),
			},
		}
	},
)

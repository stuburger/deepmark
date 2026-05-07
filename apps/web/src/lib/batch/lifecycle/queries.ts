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
		// `committed` is intentionally not in this filter — once the user has
		// finished review and committed, the staging banner disappears and
		// grading progress is rendered by the submissions tab itself.
		// `failed` stays so the UI can surface the failure to the teacher.
		const batch = await db.batchIngestJob.findFirst({
			where: {
				exam_paper_id: examPaperId,
				status: {
					in: ["classifying", "staging", "failed"] as BatchStatus[],
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

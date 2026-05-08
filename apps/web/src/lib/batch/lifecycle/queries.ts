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
		// Pull the most recent batch overall — if the teacher has already
		// committed (or abandoned older staging/failed batches by re-uploading),
		// only the freshest batch is meaningful. Filtering directly on status
		// here would surface a stale `failed` over a newer `committed`, which
		// makes a healed paper look broken. We treat as "active" only if the
		// most-recent batch is itself in flight.
		const batch = await db.batchIngestJob.findFirst({
			where: { exam_paper_id: examPaperId },
			orderBy: { created_at: "desc" },
			include: {
				staged_scripts: { orderBy: { created_at: "asc" } },
			},
		})

		const ACTIVE: BatchStatus[] = ["classifying", "staging", "failed"]
		if (!batch || !ACTIVE.includes(batch.status as BatchStatus)) {
			return { batch: null }
		}

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

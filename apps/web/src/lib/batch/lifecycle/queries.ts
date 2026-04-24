"use server"

import { db } from "@/lib/db"
import type { BatchStatus } from "@mcp-gcse/db"
import { auth } from "../../auth"
import { type ActiveBatchInfo, parsePageKeys } from "../types"

// ─── getActiveBatchForPaper ─────────────────────────────────────────────────

export async function getActiveBatchForPaper(
	examPaperId: string,
): Promise<
	{ ok: true; batch: ActiveBatchInfo } | { ok: false; error: string }
> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const batch = await db.batchIngestJob.findFirst({
		where: {
			exam_paper_id: examPaperId,
			status: { in: ["classifying", "staging", "marking"] as BatchStatus[] },
		},
		orderBy: { created_at: "desc" },
		include: {
			staged_scripts: { orderBy: { created_at: "asc" } },
		},
	})

	if (!batch) return { ok: true, batch: null }

	return {
		ok: true,
		batch: {
			id: batch.id,
			status: batch.status,
			total_student_jobs: batch.total_student_jobs,
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
}

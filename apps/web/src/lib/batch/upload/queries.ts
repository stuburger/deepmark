"use server"

import { db } from "@/lib/db"
import { auth } from "../../auth"
import { deriveScanStatus } from "../../marking/status"
import { type BatchIngestJobData, parsePageKeys } from "../types"

const submissionInclude = {
	student_submissions: {
		where: { superseded_at: null },
		select: {
			id: true,
			student_name: true,
			staged_script_id: true,
			ocr_runs: {
				orderBy: { created_at: "desc" as const },
				take: 1,
				select: { status: true },
			},
			grading_runs: {
				orderBy: { created_at: "desc" as const },
				take: 1,
				select: { status: true, grading_results: true },
			},
		},
	},
} as const

type SubRow = {
	id: string
	student_name: string | null
	staged_script_id: string | null
	ocr_runs: Array<{ status: string }>
	grading_runs: Array<{ status: string; grading_results: unknown }>
}

function mapSubmission(s: SubRow): BatchIngestJobData["student_jobs"][number] {
	const ocrStatus = (s.ocr_runs[0]?.status ?? null) as Parameters<
		typeof deriveScanStatus
	>[0]
	const gradingStatus = (s.grading_runs[0]?.status ?? null) as Parameters<
		typeof deriveScanStatus
	>[1]
	return {
		id: s.id,
		status: deriveScanStatus(ocrStatus, gradingStatus),
		student_name: s.student_name,
		grading_results: s.grading_runs[0]?.grading_results ?? null,
		staged_script_id: s.staged_script_id,
	}
}

// ─── getBatchIngestJob ──────────────────────────────────────────────────────

export type GetBatchIngestJobResult =
	| { ok: true; batch: BatchIngestJobData }
	| { ok: false; error: string }

export async function getBatchIngestJob(
	batchJobId: string,
): Promise<GetBatchIngestJobResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const batch = await db.batchIngestJob.findFirst({
		where: { id: batchJobId },
		include: {
			staged_scripts: {
				orderBy: { created_at: "asc" },
			},
			...submissionInclude,
		},
	})

	if (!batch) return { ok: false, error: "Batch job not found" }

	return {
		ok: true,
		batch: {
			id: batch.id,
			status: batch.status,
			review_mode: batch.review_mode,
			classification_mode: batch.classification_mode,
			pages_per_script: batch.pages_per_script,
			total_student_jobs: batch.total_student_jobs,
			notification_sent_at: batch.notification_sent_at,
			error: batch.error,
			staged_scripts: batch.staged_scripts.map((s) => ({
				id: s.id,
				page_keys: parsePageKeys(s.page_keys),
				proposed_name: s.proposed_name,
				confirmed_name: s.confirmed_name,
				confidence: s.confidence,
				status: s.status,
			})),
			student_jobs: batch.student_submissions.map(mapSubmission),
		},
	}
}

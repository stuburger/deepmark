"use server"

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import type { BatchStatus } from "@mcp-gcse/db"
import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../auth"
import type {
	ActiveBatchInfo,
	BatchIngestJobData,
	PageKey,
} from "./types"

const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

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
		where: { id: batchJobId, uploaded_by: session.userId },
		include: {
			staged_scripts: {
				orderBy: { created_at: "asc" },
			},
			student_jobs: {
				select: {
					id: true,
					status: true,
					student_name: true,
					grading_results: true,
				},
			},
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
				page_keys: s.page_keys as PageKey[],
				proposed_name: s.proposed_name,
				confirmed_name: s.confirmed_name,
				confidence: s.confidence,
				status: s.status,
				student_job_id: s.student_job_id,
			})),
			student_jobs: batch.student_jobs.map((j) => ({
				id: j.id,
				status: j.status,
				student_name: j.student_name,
				grading_results: j.grading_results,
			})),
		},
	}
}

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
			uploaded_by: session.userId,
			status: { in: ["classifying", "staging", "marking"] as BatchStatus[] },
		},
		orderBy: { created_at: "desc" },
		include: {
			staged_scripts: { orderBy: { created_at: "asc" } },
			student_jobs: {
				select: {
					id: true,
					status: true,
					student_name: true,
					grading_results: true,
				},
			},
		},
	})

	if (!batch) return { ok: true, batch: null }

	return {
		ok: true,
		batch: {
			id: batch.id,
			status: batch.status,
			classification_mode: batch.classification_mode,
			pages_per_script: batch.pages_per_script,
			total_student_jobs: batch.total_student_jobs,
			staged_scripts: batch.staged_scripts.map((s) => ({
				id: s.id,
				page_keys: s.page_keys as PageKey[],
				proposed_name: s.proposed_name,
				confirmed_name: s.confirmed_name,
				confidence: s.confidence,
				status: s.status,
				student_job_id: s.student_job_id,
			})),
			student_jobs: batch.student_jobs.map((j) => ({
				id: j.id,
				status: j.status,
				student_name: j.student_name,
				grading_results: j.grading_results,
			})),
		},
	}
}

// ─── getStagedScriptPageUrls ────────────────────────────────────────────────

export async function getStagedScriptPageUrls(
	batchJobId: string,
): Promise<
	{ ok: true; urls: Record<string, string> } | { ok: false; error: string }
> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const batch = await db.batchIngestJob.findFirst({
		where: { id: batchJobId, uploaded_by: session.userId },
		include: { staged_scripts: true },
	})
	if (!batch) return { ok: false, error: "Batch not found" }

	const allKeys = batch.staged_scripts.flatMap((s) =>
		(s.page_keys as PageKey[]).map((pk) => pk.s3_key),
	)

	const unique = [...new Set(allKeys)]
	const urlEntries = await Promise.all(
		unique.map(async (key) => {
			const cmd = new GetObjectCommand({ Bucket: bucketName, Key: key })
			const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 })
			return [key, url] as const
		}),
	)

	return { ok: true, urls: Object.fromEntries(urlEntries) }
}

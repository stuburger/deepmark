"use server"

import {
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import {
	type BatchStatus,
	type ReviewMode,
	createPrismaClient,
} from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "./auth"
import { log } from "./logger"

const TAG = "batch-actions"

const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})
const sqs = new SQSClient({})
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

type PageKey = {
	s3_key: string
	order: number
	mime_type: string
	source_file: string
}

// ─── createBatchIngestJob ─────────────────────────────────────────────────────

export type CreateBatchIngestJobResult =
	| { ok: true; batchJobId: string }
	| { ok: false; error: string }

export async function createBatchIngestJob(
	examPaperId: string,
	reviewMode: ReviewMode = "auto",
	blankPageMode: "script_page" | "separator" = "script_page",
	pagesPerScript = 4,
): Promise<CreateBatchIngestJobResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const examPaper = await db.examPaper.findFirst({
		where: { id: examPaperId, is_active: true },
		select: { id: true },
	})
	if (!examPaper) return { ok: false, error: "Exam paper not found" }

	const job = await db.batchIngestJob.create({
		data: {
			exam_paper_id: examPaperId,
			uploaded_by: session.userId,
			review_mode: reviewMode,
			blank_page_mode: blankPageMode,
			pages_per_script: pagesPerScript,
			status: "uploading",
		},
	})

	log.info(TAG, "BatchIngestJob created", {
		userId: session.userId,
		batchJobId: job.id,
	})

	return { ok: true, batchJobId: job.id }
}

// ─── addFileToBatch ───────────────────────────────────────────────────────────

export type AddFileToBatchResult =
	| { ok: true; uploadUrl: string; key: string }
	| { ok: false; error: string }

export async function addFileToBatch(
	batchJobId: string,
	filename: string,
	mimeType: string,
): Promise<AddFileToBatchResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const batch = await db.batchIngestJob.findFirst({
		where: { id: batchJobId, uploaded_by: session.userId },
		select: { id: true },
	})
	if (!batch) return { ok: false, error: "Batch job not found" }

	const key = `batches/${batchJobId}/source/${filename}`
	const command = new PutObjectCommand({
		Bucket: bucketName,
		Key: key,
		ContentType: mimeType,
	})
	const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 })

	return { ok: true, uploadUrl, key }
}

// ─── updateBatchJobSettings ───────────────────────────────────────────────────

export type UpdateBatchJobSettingsResult =
	| { ok: true }
	| { ok: false; error: string }

export async function updateBatchJobSettings(
	batchJobId: string,
	settings: {
		pagesPerScript?: number
		blankPageMode?: "script_page" | "separator"
		reviewMode?: "auto" | "required"
	},
): Promise<UpdateBatchJobSettingsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const batch = await db.batchIngestJob.findFirst({
		where: { id: batchJobId, uploaded_by: session.userId, status: "uploading" },
		select: { id: true },
	})
	if (!batch)
		return { ok: false, error: "Batch job not found or already started" }

	await db.batchIngestJob.update({
		where: { id: batchJobId },
		data: {
			...(settings.pagesPerScript !== undefined && {
				pages_per_script: settings.pagesPerScript,
			}),
			...(settings.blankPageMode !== undefined && {
				blank_page_mode: settings.blankPageMode,
			}),
			...(settings.reviewMode !== undefined && {
				review_mode: settings.reviewMode,
			}),
		},
	})

	return { ok: true }
}

// ─── triggerClassification ────────────────────────────────────────────────────

export type TriggerClassificationResult =
	| { ok: true }
	| { ok: false; error: string }

export async function triggerClassification(
	batchJobId: string,
): Promise<TriggerClassificationResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const batch = await db.batchIngestJob.findFirst({
		where: { id: batchJobId, uploaded_by: session.userId },
		select: { id: true },
	})
	if (!batch) return { ok: false, error: "Batch job not found" }

	await sqs.send(
		new SendMessageCommand({
			QueueUrl: Resource.BatchClassifyQueue.url,
			MessageBody: JSON.stringify({ batch_job_id: batchJobId }),
		}),
	)

	log.info(TAG, "Classification triggered", {
		userId: session.userId,
		batchJobId,
	})

	return { ok: true }
}

// ─── getBatchIngestJob ────────────────────────────────────────────────────────

export type BatchIngestJobData = {
	id: string
	status: BatchStatus
	review_mode: ReviewMode
	total_student_jobs: number
	notification_sent_at: Date | null
	error: string | null
	staged_scripts: Array<{
		id: string
		page_keys: PageKey[]
		proposed_name: string | null
		confirmed_name: string | null
		confidence: number | null
		status: string
		student_job_id: string | null
	}>
	student_jobs: Array<{
		id: string
		status: string
		student_name: string | null
		grading_results: unknown
	}>
}

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

// ─── updateStagedScript ───────────────────────────────────────────────────────

export type UpdateStagedScriptResult =
	| { ok: true }
	| { ok: false; error: string }

export async function updateStagedScript(
	scriptId: string,
	updates: {
		confirmedName?: string
		status?: "proposed" | "confirmed" | "excluded"
	},
): Promise<UpdateStagedScriptResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const script = await db.stagedScript.findFirst({
		where: { id: scriptId },
		include: { batch_job: { select: { uploaded_by: true } } },
	})
	if (!script || script.batch_job.uploaded_by !== session.userId) {
		return { ok: false, error: "Staged script not found" }
	}

	await db.stagedScript.update({
		where: { id: scriptId },
		data: {
			confirmed_name: updates.confirmedName ?? script.confirmed_name,
			status: updates.status ?? script.status,
		},
	})

	return { ok: true }
}

// ─── commitBatch ──────────────────────────────────────────────────────────────

export type CommitBatchResult =
	| { ok: true; studentJobCount: number }
	| { ok: false; error: string }

export async function commitBatch(
	batchJobId: string,
): Promise<CommitBatchResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	return commitBatchService(batchJobId, session.userId)
}

/**
 * Service function — can be called directly from tests without going through
 * Next.js server action auth middleware.
 */
export async function commitBatchService(
	batchJobId: string,
	uploadedBy: string,
): Promise<CommitBatchResult> {
	const batch = await db.batchIngestJob.findFirst({
		where: { id: batchJobId, uploaded_by: uploadedBy },
		include: {
			staged_scripts: {
				where: { status: "confirmed" },
			},
			exam_paper: {
				select: {
					id: true,
					exam_board: true,
					subject: true,
					year: true,
				},
			},
		},
	})

	if (!batch) return { ok: false, error: "Batch job not found" }

	const unconfirmed = await db.stagedScript.count({
		where: { batch_job_id: batchJobId, status: "proposed" },
	})
	if (unconfirmed > 0) {
		return {
			ok: false,
			error: `${unconfirmed} script${unconfirmed === 1 ? "" : "s"} still need review before committing`,
		}
	}

	const confirmedScripts = batch.staged_scripts

	if (confirmedScripts.length === 0) {
		return { ok: false, error: "No confirmed scripts to commit" }
	}

	const createdJobs = await db.$transaction(async (tx) => {
		const jobs = await Promise.all(
			confirmedScripts.map((script) => {
				const pageKeys = script.page_keys as PageKey[]
				return tx.studentPaperJob.create({
					data: {
						s3_key: pageKeys[0]?.s3_key ?? "",
						s3_bucket: bucketName,
						status: "pending",
						uploaded_by: uploadedBy,
						exam_paper_id: batch.exam_paper.id,
						exam_board: batch.exam_paper.exam_board ?? "Unknown",
						subject: batch.exam_paper.subject,
						year: batch.exam_paper.year,
						pages: pageKeys.map(({ s3_key, order, mime_type }) => ({
							key: s3_key,
							order,
							mime_type,
						})) as never,
						student_name: script.confirmed_name ?? script.proposed_name,
						batch_job_id: batchJobId,
					},
				})
			}),
		)

		await Promise.all(
			confirmedScripts.map((script, i) =>
				tx.stagedScript.update({
					where: { id: script.id },
					data: { student_job_id: jobs[i]!.id },
				}),
			),
		)

		await tx.batchIngestJob.update({
			where: { id: batchJobId },
			data: {
				status: "marking" as BatchStatus,
				total_student_jobs: jobs.length,
			},
		})

		return jobs
	})

	for (const job of createdJobs) {
		await sqs.send(
			new SendMessageCommand({
				QueueUrl: Resource.StudentPaperOcrQueue.url,
				MessageBody: JSON.stringify({ job_id: job.id }),
			}),
		)
	}

	log.info(TAG, "Batch committed", {
		userId: uploadedBy,
		batchJobId,
		jobCount: createdJobs.length,
	})

	return { ok: true, studentJobCount: createdJobs.length }
}

// ─── getActiveBatchForPaper ───────────────────────────────────────────────────

export type ActiveBatchInfo = {
	id: string
	status: BatchStatus
	total_student_jobs: number
	staged_scripts: BatchIngestJobData["staged_scripts"]
	student_jobs: BatchIngestJobData["student_jobs"]
} | null

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

// ─── getVapidPublicKey ────────────────────────────────────────────────────────

export async function getVapidPublicKey(): Promise<string> {
	return Resource.VapidPublicKey.value
}

// ─── registerPushSubscription ─────────────────────────────────────────────────

export type RegisterPushSubscriptionResult =
	| { ok: true }
	| { ok: false; error: string }

export async function registerPushSubscription({
	endpoint,
	p256dh,
	auth: authKey,
	userAgent,
}: {
	endpoint: string
	p256dh: string
	auth: string
	userAgent?: string
}): Promise<RegisterPushSubscriptionResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	await db.userPushSubscription.upsert({
		where: { endpoint },
		create: {
			user_id: session.userId,
			endpoint,
			p256dh,
			auth: authKey,
			user_agent: userAgent,
		},
		update: {
			p256dh,
			auth: authKey,
			user_agent: userAgent,
		},
	})

	return { ok: true }
}

// ─── getStagedScriptPageUrls ──────────────────────────────────────────────────

/**
 * Returns short-lived presigned GET URLs for every page across all staged
 * scripts in a batch, keyed by s3_key. Used by the page editor UI.
 */
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

// ─── updateStagedScriptPageKeys ───────────────────────────────────────────────

export type UpdateStagedScriptPageKeysResult =
	| { ok: true }
	| { ok: false; error: string }

export async function updateStagedScriptPageKeys(
	scriptId: string,
	pageKeys: PageKey[],
): Promise<UpdateStagedScriptPageKeysResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const script = await db.stagedScript.findFirst({
		where: { id: scriptId },
		include: { batch_job: { select: { uploaded_by: true } } },
	})
	if (!script || script.batch_job.uploaded_by !== session.userId) {
		return { ok: false, error: "Staged script not found" }
	}

	await db.stagedScript.update({
		where: { id: scriptId },
		data: { page_keys: pageKeys as never },
	})

	return { ok: true }
}

// ─── deleteStagedScript ───────────────────────────────────────────────────────

export type DeleteStagedScriptResult =
	| { ok: true }
	| { ok: false; error: string }

export async function deleteStagedScript(
	scriptId: string,
): Promise<DeleteStagedScriptResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const script = await db.stagedScript.findFirst({
		where: { id: scriptId },
		include: { batch_job: { select: { uploaded_by: true } } },
	})
	if (!script || script.batch_job.uploaded_by !== session.userId) {
		return { ok: false, error: "Staged script not found" }
	}

	await db.stagedScript.delete({ where: { id: scriptId } })

	return { ok: true }
}

// ─── splitStagedScript ────────────────────────────────────────────────────────

export type SplitStagedScriptResult =
	| { ok: true; newScriptId: string }
	| { ok: false; error: string }

/**
 * Splits a staged script at `splitAfterIndex`: pages 0..splitAfterIndex stay
 * in the original script; pages splitAfterIndex+1..end move to a new script.
 */
export async function splitStagedScript(
	scriptId: string,
	splitAfterIndex: number,
): Promise<SplitStagedScriptResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const script = await db.stagedScript.findFirst({
		where: { id: scriptId },
		include: { batch_job: { select: { uploaded_by: true } } },
	})
	if (!script || script.batch_job.uploaded_by !== session.userId) {
		return { ok: false, error: "Staged script not found" }
	}

	const pageKeys = script.page_keys as PageKey[]
	if (splitAfterIndex < 0 || splitAfterIndex >= pageKeys.length - 1) {
		return { ok: false, error: "Invalid split index" }
	}

	const firstHalf = pageKeys.slice(0, splitAfterIndex + 1)
	const secondHalf = pageKeys
		.slice(splitAfterIndex + 1)
		.map((pk, i) => ({ ...pk, order: i + 1 }))

	await db.stagedScript.update({
		where: { id: scriptId },
		data: { page_keys: firstHalf as never },
	})

	const newScript = await db.stagedScript.create({
		data: {
			batch_job_id: script.batch_job_id,
			page_keys: secondHalf as never,
			status: "proposed" as const,
		},
	})

	return { ok: true, newScriptId: newScript.id }
}

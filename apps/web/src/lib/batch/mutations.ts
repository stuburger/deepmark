"use server"

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import {
	type BatchStatus,
	type ClassificationMode,
	type ReviewMode,
	createPrismaClient,
} from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../auth"
import { log } from "../logger"
import type { PageKey } from "./types"

const TAG = "batch/mutations"

const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})
const sqs = new SQSClient({})
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

// ─── createBatchIngestJob ───────────────────────────────────────────────────

export type CreateBatchIngestJobResult =
	| { ok: true; batchJobId: string }
	| { ok: false; error: string }

export async function createBatchIngestJob(
	examPaperId: string,
	reviewMode: ReviewMode = "auto",
	blankPageMode: "script_page" | "separator" = "script_page",
	pagesPerScript = 4,
	classificationMode: ClassificationMode = "auto",
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
			classification_mode: classificationMode,
			status: "uploading",
		},
	})

	log.info(TAG, "BatchIngestJob created", {
		userId: session.userId,
		batchJobId: job.id,
	})

	return { ok: true, batchJobId: job.id }
}

// ─── addFileToBatch ─────────────────────────────────────────────────────────

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

// ─── updateBatchJobSettings ─────────────────────────────────────────────────

export type UpdateBatchJobSettingsResult =
	| { ok: true }
	| { ok: false; error: string }

export async function updateBatchJobSettings(
	batchJobId: string,
	settings: {
		pagesPerScript?: number
		blankPageMode?: "script_page" | "separator"
		reviewMode?: "auto" | "required"
		classificationMode?: "auto" | "per_file"
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
			...(settings.classificationMode !== undefined && {
				classification_mode: settings.classificationMode as ClassificationMode,
			}),
		},
	})

	return { ok: true }
}

// ─── triggerClassification ──────────────────────────────────────────────────

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

// ─── updateStagedScript ─────────────────────────────────────────────────────

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

// ─── commitBatch ────────────────────────────────────────────────────────────

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

// ─── updateStagedScriptPageKeys ─────────────────────────────────────────────

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

// ─── deleteStagedScript ─────────────────────────────────────────────────────

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

// ─── splitStagedScript ──────────────────────────────────────────────────────

export type SplitStagedScriptResult =
	| { ok: true; newScriptId: string }
	| { ok: false; error: string }

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

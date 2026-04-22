"use server"

import { db } from "@/lib/db"
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import type {
	BatchStatus,
	ClassificationMode,
	ReviewMode,
	StagedScriptStatus,
} from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../auth"
import { log } from "../logger"
import { type PageKey, parsePageKeys } from "./types"

const TAG = "batch/mutations"

const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})
const sqs = new SQSClient({})

// ─── createBatchIngestJob ───────────────────────────────────────────────────

export type CreateBatchIngestJobResult =
	| { ok: true; batchJobId: string }
	| { ok: false; error: string }

export async function createBatchIngestJob(
	examPaperId: string,
	reviewMode: ReviewMode = "auto",
	pagesPerScript = 4,
	classificationMode:
		| "auto"
		| "per_file"
		| "fixed_pages"
		| "blank_separator" = "auto",
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
		where: { id: batchJobId },
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
		reviewMode?: "auto" | "required"
		classificationMode?: "auto" | "per_file" | "fixed_pages" | "blank_separator"
	},
): Promise<UpdateBatchJobSettingsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const batch = await db.batchIngestJob.findFirst({
		where: { id: batchJobId, status: "uploading" },
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
		where: { id: batchJobId },
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
		status?: "confirmed" | "excluded"
	},
): Promise<UpdateStagedScriptResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const script = await db.stagedScript.findFirst({
		where: { id: scriptId },
	})
	if (!script) {
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
		where: { id: batchJobId },
		include: {
			staged_scripts: {
				where: { status: "confirmed" },
			},
			student_submissions: {
				where: { superseded_at: null },
				select: { staged_script_id: true },
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

	// Exclude scripts already submitted in a previous commit
	const alreadySubmitted = new Set(
		batch.student_submissions.map((j) => j.staged_script_id).filter(Boolean),
	)
	const confirmedScripts = batch.staged_scripts.filter(
		(s) => !alreadySubmitted.has(s.id),
	)

	if (confirmedScripts.length === 0) {
		return { ok: false, error: "No confirmed scripts to commit" }
	}

	const createdJobs = await db.$transaction(async (tx) => {
		const jobs = await Promise.all(
			confirmedScripts.map(async (script) => {
				const pageKeys = parsePageKeys(script.page_keys)
				const pagesJson = pageKeys.map(({ s3_key, order, mime_type }) => ({
					key: s3_key,
					order,
					mime_type,
				}))
				const studentName = script.confirmed_name ?? script.proposed_name

				return tx.studentSubmission.create({
					data: {
						s3_key: pageKeys[0]?.s3_key ?? "",
						s3_bucket: bucketName,
						uploaded_by: uploadedBy,
						exam_paper_id: batch.exam_paper.id,
						exam_board: batch.exam_paper.exam_board ?? "Unknown",
						subject: batch.exam_paper.subject,
						year: batch.exam_paper.year,
						pages: pagesJson as never,
						student_name: studentName,
						batch_job_id: batchJobId,
						staged_script_id: script.id,
					},
				})
			}),
		)

		// Mark staged scripts as submitted so the batch query doesn't need to join submissions
		await tx.stagedScript.updateMany({
			where: { id: { in: confirmedScripts.map((s) => s.id) } },
			data: { status: "submitted" },
		})

		await tx.batchIngestJob.update({
			where: { id: batchJobId },
			data: {
				status: "marking" as BatchStatus,
				total_student_jobs: { increment: jobs.length },
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
	})
	if (!script) {
		return { ok: false, error: "Staged script not found" }
	}

	await db.stagedScript.update({
		where: { id: scriptId },
		data: { page_keys: pageKeys as never },
	})

	return { ok: true }
}

// ─── createEmptyStagedScript ────────────────────────────────────────────────

export type CreateEmptyStagedScriptResult =
	| {
			ok: true
			script: {
				id: string
				page_keys: []
				proposed_name: null
				confirmed_name: null
				confidence: null
				status: StagedScriptStatus
			}
	  }
	| { ok: false; error: string }

export async function createEmptyStagedScript(
	batchJobId: string,
): Promise<CreateEmptyStagedScriptResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const batch = await db.batchIngestJob.findFirst({
		where: { id: batchJobId },
		select: { id: true },
	})
	if (!batch) return { ok: false, error: "Batch job not found" }

	const script = await db.stagedScript.create({
		data: {
			batch_job_id: batchJobId,
			page_keys: [] as never,
			status: "proposed",
		},
	})

	return {
		ok: true,
		script: {
			id: script.id,
			page_keys: [],
			proposed_name: null,
			confirmed_name: null,
			confidence: null,
			status: script.status,
		},
	}
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
	})
	if (!script) {
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
	})
	if (!script) {
		return { ok: false, error: "Staged script not found" }
	}

	const pageKeys = parsePageKeys(script.page_keys)
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
			status: "excluded" as const,
		},
	})

	return { ok: true, newScriptId: newScript.id }
}

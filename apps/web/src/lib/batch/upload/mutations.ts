"use server"

import { db } from "@/lib/db"
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { Resource } from "sst"
import { auth } from "../../auth"
import { log } from "../../logger"

const TAG = "batch/upload"

const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})
const sqs = new SQSClient({})

// ─── createBatchIngestJob ───────────────────────────────────────────────────

export type CreateBatchIngestJobResult =
	| { ok: true; batchJobId: string }
	| { ok: false; error: string }

export async function createBatchIngestJob(
	examPaperId: string,
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

	// Flip to "classifying" so the client's activeBatch query picks it up
	// immediately on refetch. Without this, the row sits at "uploading" until
	// the Lambda wakes up — leaving the teacher with no visible feedback for
	// 1–3s after closing the upload dialog.
	await db.batchIngestJob.update({
		where: { id: batchJobId },
		data: { status: "classifying" },
	})

	log.info(TAG, "Classification triggered", {
		userId: session.userId,
		batchJobId,
	})

	return { ok: true }
}

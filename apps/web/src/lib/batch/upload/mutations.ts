"use server"

import { resourceAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { Resource } from "sst"
import { z } from "zod"

const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})
const sqs = new SQSClient({})

export const createBatchIngestJob = resourceAction({
	type: "examPaper",
	role: "editor",
	schema: z.object({ examPaperId: z.string() }),
	id: ({ examPaperId }) => examPaperId,
}).action(
	async ({
		parsedInput: { examPaperId },
		ctx,
	}): Promise<{ batchJobId: string }> => {
		const examPaper = await db.examPaper.findFirst({
			where: { id: examPaperId, is_active: true },
			select: { id: true },
		})
		if (!examPaper) throw new Error("Exam paper not found")

		const job = await db.batchIngestJob.create({
			data: {
				exam_paper_id: examPaperId,
				uploaded_by: ctx.user.id,
				status: "uploading",
			},
		})

		ctx.log.info("BatchIngestJob created", { batchJobId: job.id })

		return { batchJobId: job.id }
	},
)

export const addFileToBatch = resourceAction({
	type: "batch",
	role: "editor",
	schema: z.object({
		batchJobId: z.string(),
		filename: z.string(),
		mimeType: z.string(),
	}),
	id: ({ batchJobId }) => batchJobId,
}).action(
	async ({
		parsedInput: { batchJobId, filename, mimeType },
	}): Promise<{ uploadUrl: string; key: string }> => {
		const batch = await db.batchIngestJob.findFirst({
			where: { id: batchJobId },
			select: { id: true },
		})
		if (!batch) throw new Error("Batch job not found")

		const key = `batches/${batchJobId}/source/${filename}`
		const command = new PutObjectCommand({
			Bucket: bucketName,
			Key: key,
			ContentType: mimeType,
		})
		const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 })

		return { uploadUrl, key }
	},
)

export const triggerClassification = resourceAction({
	type: "batch",
	role: "editor",
	schema: z.object({ batchJobId: z.string() }),
	id: ({ batchJobId }) => batchJobId,
}).action(
	async ({ parsedInput: { batchJobId }, ctx }): Promise<{ ok: true }> => {
		const batch = await db.batchIngestJob.findFirst({
			where: { id: batchJobId },
			select: { id: true },
		})
		if (!batch) throw new Error("Batch job not found")

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

		ctx.log.info("Classification triggered", { batchJobId })

		return { ok: true }
	},
)

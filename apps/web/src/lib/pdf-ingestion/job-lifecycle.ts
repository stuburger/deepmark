"use server"

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../auth"

const s3 = new S3Client({})
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

// ─── getPdfIngestionJobStatus ───────────────────────────────────────────────

export type GetPdfIngestionJobStatusResult =
	| {
			ok: true
			status: string
			error: string | null
			detected_exam_paper_metadata: unknown
			auto_create_exam_paper: boolean
	  }
	| { ok: false; error: string }

export async function getPdfIngestionJobStatus(
	jobId: string,
): Promise<GetPdfIngestionJobStatusResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const job = await db.pdfIngestionJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
	})
	if (!job) return { ok: false, error: "Job not found" }
	return {
		ok: true,
		status: job.status,
		error: job.error,
		detected_exam_paper_metadata: job.detected_exam_paper_metadata,
		auto_create_exam_paper: job.auto_create_exam_paper,
	}
}

// ─── getPdfIngestionJobDownloadUrl ──────────────────────────────────────────

export type GetPdfDownloadUrlResult =
	| { ok: true; url: string }
	| { ok: false; error: string }

export async function getPdfIngestionJobDownloadUrl(
	jobId: string,
): Promise<GetPdfDownloadUrlResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const job = await db.pdfIngestionJob.findFirst({
		where: { id: jobId, uploaded_by: session.userId },
		select: { s3_key: true, s3_bucket: true },
	})
	if (!job) return { ok: false, error: "Job not found" }
	if (!job.s3_key) return { ok: false, error: "No PDF on file for this job" }
	const command = new GetObjectCommand({
		Bucket: job.s3_bucket,
		Key: job.s3_key,
	})
	const url = await getSignedUrl(s3, command, { expiresIn: 300 })
	return { ok: true, url }
}

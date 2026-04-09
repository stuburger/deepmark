import { db } from "@/db"
import { logger } from "@/lib/infra/logger"
import type { SqsRecord } from "@/lib/infra/sqs-job-runner"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"

const s3 = new S3Client({})

// ─── Shared types ────────────────────────────────────────────────────────────

export interface S3Record {
	s3: { bucket: { name: string }; object: { key: string } }
}

// ─── S3 utilities ────────────────────────────────────────────────────────────

/**
 * Fetches an S3 object and returns its contents as a base64 string.
 * Used by PDF processor lambdas to pass documents to Gemini.
 */
export async function getPdfBase64(
	bucket: string,
	key: string,
): Promise<string> {
	const cmd = new GetObjectCommand({ Bucket: bucket, Key: key })
	const response = await s3.send(cmd)
	const body = await response.Body?.transformToByteArray()
	if (!body?.length) throw new Error("Empty S3 object")
	return Buffer.from(body).toString("base64")
}

/**
 * Extracts the job id from an S3 key of the form:
 *   pdfs/<docType>/<jobId>/document.pdf
 *
 * Throws if the key does not match the expected structure.
 */
export function parseJobIdFromKey(key: string, docType: string): string {
	const decoded = decodeURIComponent(key)
	const parts = decoded.split("/")
	if (parts.length < 4 || parts[0] !== "pdfs" || parts[1] !== docType) {
		throw new Error(`Unexpected S3 key format for docType "${docType}": ${key}`)
	}
	return parts[2] ?? ""
}

/**
 * Formats an embedding vector as a Postgres-compatible vector string.
 */
export function embeddingToVectorStr(vec: number[]): string {
	return `[${vec.join(",")}]`
}

// ─── PDF ingestion trigger parsing ───────────────────────────────────────────

export type PdfTriggerResult =
	| { kind: "resolved"; jobId: string; bucket: string; key: string }
	| { kind: "skip"; reason: string }

/**
 * Parses an SQS record for a PDF ingestion handler, handling both direct S3
 * event triggers and SQS messages with a `job_id` field.
 *
 * Returns a discriminated union — callers should `continue` on `skip`.
 */
export async function parsePdfIngestionTrigger(
	record: SqsRecord,
	documentType: string,
	s3Folder: string,
	tag: string,
): Promise<PdfTriggerResult> {
	const body = JSON.parse(record.body) as
		| { Records?: S3Record[] }
		| { job_id: string }

	if ("job_id" in body && typeof body.job_id === "string") {
		const jobId = body.job_id
		const job = await db.pdfIngestionJob.findUniqueOrThrow({
			where: { id: jobId },
		})
		if (job.document_type !== documentType) {
			return {
				kind: "skip",
				reason: `Job is not ${documentType} — skipping (got ${job.document_type})`,
			}
		}
		return { kind: "resolved", jobId, bucket: job.s3_bucket, key: job.s3_key }
	}

	const s3Event = body as { Records?: S3Record[] }
	const s3Records = s3Event.Records ?? []
	const s3Record = s3Records[0]
	if (!s3Record) {
		return { kind: "skip", reason: "No S3 record in SQS message" }
	}

	const bucket = s3Record.s3.bucket.name
	const key = decodeURIComponent(s3Record.s3.object.key)
	const jobId = parseJobIdFromKey(key, s3Folder)
	logger.info(tag, "Triggered by S3 event", { jobId, bucket, key })

	return { kind: "resolved", jobId, bucket, key }
}

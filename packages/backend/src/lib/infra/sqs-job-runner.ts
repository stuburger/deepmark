import { db } from "@/db"
import { logger } from "@/lib/infra/logger"
import { type S3Record, parseJobIdFromKey } from "@/lib/infra/processor-s3"
import {
	type GradingStatus,
	type OcrStatus,
	type ScanStatus,
	logGradingRunEvent,
	logOcrRunEvent,
} from "@mcp-gcse/db"

export interface SqsRecord {
	messageId: string
	body: string
}

export interface SqsEvent {
	Records: SqsRecord[]
}

/**
 * Parses the job_id from an SQS message body.
 * Returns null (and logs a warning) if the field is missing.
 */
export function parseSqsJobId(record: SqsRecord, tag: string): string | null {
	const body = JSON.parse(record.body) as { job_id?: string }
	const jobId = body.job_id
	if (!jobId) {
		logger.warn(tag, "Message missing job_id", { messageId: record.messageId })
		return null
	}
	return jobId
}

/**
 * Marks a job as failed on the corresponding run record (OcrRun or GradingRun).
 * Safe to call from a catch block — any DB errors are swallowed.
 */
export async function markJobFailed(
	jobId: string,
	tag: string,
	phase: "ocr" | "grading" | "enrich",
	err: unknown,
): Promise<void> {
	logger.error(tag, "Job failed", { jobId, phase, error: String(err) })
	const message = err instanceof Error ? err.message : String(err)

	// Fail the corresponding run record and log the event.
	// Uses id === jobId (same convention as the processors' upsert calls).
	try {
		if (phase === "ocr") {
			await db.ocrRun.update({
				where: { id: jobId },
				data: { status: "failed" satisfies OcrStatus, error: message },
			})
			void logOcrRunEvent(db, jobId, {
				type: "job_failed",
				at: new Date().toISOString(),
				phase,
				error: message,
			})
		} else if (phase === "grading") {
			await db.gradingRun.update({
				where: { id: jobId },
				data: { status: "failed" satisfies GradingStatus, error: message },
			})
			void logGradingRunEvent(db, jobId, {
				type: "job_failed",
				at: new Date().toISOString(),
				phase,
				error: message,
			})
		}
	} catch {
		// ignore — don't mask the original error
	}
	// Enrichment failures are handled by the enrich processor directly (never touches main job status)
}

/**
 * Marks a PdfIngestionJob as failed. Used in the catch block of PDF ingestion
 * handlers (mark-scheme, question-paper, exemplar).
 *
 * Re-parses the SQS record body to extract the jobId (since it may not be in
 * scope in the catch block). Safe to call — DB errors are swallowed.
 */
export async function markPdfIngestionFailed(
	record: SqsRecord,
	s3Folder: string,
	tag: string,
	err: unknown,
): Promise<void> {
	logger.error(tag, "Job failed with unhandled error", { error: String(err) })
	const message = err instanceof Error ? err.message : String(err)
	try {
		const body = JSON.parse(record.body) as
			| { job_id?: string }
			| { Records?: S3Record[] }
		const jobId =
			"job_id" in body && body.job_id
				? body.job_id
				: parseJobIdFromKey(
						(body as { Records?: S3Record[] }).Records?.[0]?.s3?.object?.key ??
							"",
						s3Folder,
					)
		if (jobId) {
			await db.pdfIngestionJob.update({
				where: { id: jobId },
				data: { status: "failed" satisfies ScanStatus, error: message },
			})
		}
	} catch {
		// ignore — don't mask the original error
	}
}

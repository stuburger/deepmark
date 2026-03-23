import { db } from "@/db"
import { logger } from "@/lib/logger"
import { type ScanStatus, logStudentPaperEvent } from "@mcp-gcse/db"

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
 * Marks a student paper job as failed: logs the error, updates the DB status,
 * and fires a job_failed event. Safe to call from a catch block — any DB
 * errors are swallowed so the original error is not obscured.
 */
export async function markJobFailed(
	jobId: string,
	tag: string,
	phase: "ocr" | "grading",
	err: unknown,
): Promise<void> {
	logger.error(tag, "Job failed", { jobId, phase, error: String(err) })
	const message = err instanceof Error ? err.message : String(err)
	try {
		await db.studentPaperJob.update({
			where: { id: jobId },
			data: { status: "failed" as ScanStatus, error: message },
		})
		void logStudentPaperEvent(db, jobId, {
			type: "job_failed",
			at: new Date().toISOString(),
			phase,
			error: message,
		})
	} catch {
		// ignore — don't mask the original error
	}
}

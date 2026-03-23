import { db } from "@/db"
import {
	type CancellationToken,
	createCancellationToken,
} from "@/lib/cancellation"
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
 * Processes a single SQS record for a student paper job.
 *
 * Owns: body parsing, missing-jobId guard, cancellation token lifecycle,
 * try/catch, status → "failed" DB update on error, and job_failed event log.
 *
 * The callback should use early `return` instead of `continue` for skip cases
 * (e.g. already-cancelled job). Only thrown errors are treated as failures.
 */
export async function processSqsJob(
	record: SqsRecord,
	tag: string,
	phase: "ocr" | "grading",
	fn: (jobId: string, cancellation: CancellationToken) => Promise<void>,
): Promise<{ failed: boolean }> {
	const { messageId } = record
	let jobId: string | undefined
	let cancellation: CancellationToken | undefined

	try {
		const body = JSON.parse(record.body) as { job_id: string }
		jobId = body.job_id

		if (!jobId) {
			logger.warn(tag, "Message missing job_id", { messageId })
			return { failed: false }
		}

		cancellation = createCancellationToken(jobId)
		await fn(jobId, cancellation)
		return { failed: false }
	} catch (err) {
		logger.error(tag, "Job failed", { jobId, phase, error: String(err) })
		const message = err instanceof Error ? err.message : String(err)
		if (jobId) {
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
				// ignore
			}
		}
		return { failed: true }
	} finally {
		cancellation?.stop()
	}
}

import { db } from "@/db"
import { logger } from "@/lib/infra/logger"
import { markJobFailed, parseSqsJobId } from "@/lib/infra/sqs-job-runner"
import type { SqsEvent } from "@/lib/infra/sqs-job-runner"
import { refundFailedGradingRun } from "@mcp-gcse/db"
import { checkAndNotifyBatchCompletion } from "./student-paper-grade"

const TAG = "student-paper-ocr-dlq"

/**
 * DLQ handler for the OCR queue.
 *
 * Fires when a message exhausts its retries on StudentPaperOcrQueue.
 * Marks the OcrRun as failed, refunds the user's paper-ledger consume row
 * (which was reserved at submit time, before OCR even started), then runs
 * the ProcessingBatch completion check. That last step is what closes the
 * silent-email bug: previously a permanently-failing job stayed at "pending"
 * grading, so the batch's terminal-count never reached total and no email
 * fired. The completion check now treats `ocr_run.status = failed` as
 * terminal, so the batch can settle even when OCR never completed.
 *
 * Refunds are idempotent via `@@unique([kind, grading_run_id])`. Grading
 * never runs for an OCR-failed job, so there's no double-refund risk
 * against the grading DLQ.
 */
export async function handler(event: SqsEvent): Promise<void> {
	for (const record of event.Records) {
		const jobId = parseSqsJobId(record, TAG)
		if (!jobId) continue

		try {
			await markJobFailed(
				jobId,
				TAG,
				"ocr",
				new Error("OCR failed after maximum retries"),
			)
			const refund = await refundFailedGradingRun({ db, gradingRunId: jobId })
			logger.info(TAG, "Job marked as failed from OCR DLQ", {
				jobId,
				refunded: refund.refunded,
				foundConsume: refund.foundConsume,
			})

			const sub = await db.studentSubmission.findUnique({
				where: { id: jobId },
				select: { processing_batch_id: true },
			})
			if (sub?.processing_batch_id) {
				await checkAndNotifyBatchCompletion(sub.processing_batch_id)
			}
		} catch (err) {
			logger.error(TAG, "DLQ handler error", { jobId, error: String(err) })
		}
	}
}

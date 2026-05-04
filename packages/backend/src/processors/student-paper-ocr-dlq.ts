import { db } from "@/db"
import { logger } from "@/lib/infra/logger"
import { markJobFailed, parseSqsJobId } from "@/lib/infra/sqs-job-runner"
import type { SqsEvent } from "@/lib/infra/sqs-job-runner"
import { refundFailedGradingRun } from "@mcp-gcse/db"

const TAG = "student-paper-ocr-dlq"

/**
 * DLQ handler for the OCR queue.
 *
 * Fires when a message exhausts its retries on StudentPaperOcrQueue.
 * Marks the OcrRun as failed and refunds the user's paper-ledger consume
 * row (which was reserved at submit time, before OCR even started). The
 * refund is idempotent via `@@unique([kind, grading_run_id])`. The grading
 * Lambda never runs for an OCR-failed job (OCR DLQ is terminal), so there's
 * no double-refund risk against the grading DLQ.
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
		} catch (err) {
			logger.error(TAG, "DLQ handler error", { jobId, error: String(err) })
		}
	}
}

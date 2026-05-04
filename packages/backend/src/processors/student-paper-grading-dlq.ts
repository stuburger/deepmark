import { db } from "@/db"
import { logger } from "@/lib/infra/logger"
import { markJobFailed, parseSqsJobId } from "@/lib/infra/sqs-job-runner"
import type { SqsEvent } from "@/lib/infra/sqs-job-runner"
import { refundFailedGradingRun } from "@mcp-gcse/db"

const TAG = "student-paper-grading-dlq"

/**
 * DLQ handler for the grading queue.
 *
 * Fires when a message exhausts its retries on StudentPaperQueue.
 * Marks the GradingRun as failed and refunds the user's paper-ledger consume
 * row (if one exists — admin / Limitless never reserved one). The refund is
 * idempotent via `@@unique([kind, grading_run_id])`, so an OCR-DLQ refund
 * already issued for the same job is a silent no-op here.
 */
export async function handler(event: SqsEvent): Promise<void> {
	for (const record of event.Records) {
		const jobId = parseSqsJobId(record, TAG)
		if (!jobId) continue

		try {
			await markJobFailed(
				jobId,
				TAG,
				"grading",
				new Error("Grading failed after maximum retries"),
			)
			const refund = await refundFailedGradingRun({ db, gradingRunId: jobId })
			logger.info(TAG, "Job marked as failed from grading DLQ", {
				jobId,
				refunded: refund.refunded,
				foundConsume: refund.foundConsume,
			})
		} catch (err) {
			logger.error(TAG, "DLQ handler error", { jobId, error: String(err) })
		}
	}
}

import { db } from "@/db"
import { logger } from "@/lib/infra/logger"
import { markJobFailed, parseSqsJobId } from "@/lib/infra/sqs-job-runner"
import type { SqsEvent } from "@/lib/infra/sqs-job-runner"
import { refundFailedGradingRun } from "@mcp-gcse/db"
import { checkAndNotifyBatchCompletion } from "./student-paper-grade"

const TAG = "student-paper-grading-dlq"

/**
 * DLQ handler for the grading queue.
 *
 * Fires when a message exhausts its retries on StudentPaperQueue.
 * Marks the GradingRun as failed, refunds the user's paper-ledger consume
 * row (if one exists — admin / Unlimited never reserved one), then runs
 * the ProcessingBatch completion check so the batch settles and the email
 * fires even when this submission permanently fails. Refunds are
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

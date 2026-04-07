import { logger } from "@/lib/infra/logger"
import { markJobFailed, parseSqsJobId } from "@/lib/infra/sqs-job-runner"
import type { SqsEvent } from "@/lib/infra/sqs-job-runner"

const TAG = "student-paper-grading-dlq"

/**
 * DLQ handler for the grading queue.
 *
 * Fires when a message exhausts its retries on StudentPaperQueue.
 * This handler already knows the phase — no state inspection needed.
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
			logger.info(TAG, "Job marked as failed from grading DLQ", { jobId })
		} catch (err) {
			logger.error(TAG, "DLQ handler error", { jobId, error: String(err) })
		}
	}
}

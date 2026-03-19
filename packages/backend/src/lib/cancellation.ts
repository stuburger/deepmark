import { db } from "@/db"
import { logger } from "@/lib/logger"

const TAG = "cancellation"

export interface CancellationToken {
	isCancelled: () => boolean
	stop: () => void
}

/**
 * Polls the DB every `intervalMs` milliseconds to check whether a
 * pdfIngestionJob has been cancelled. Callers should check `isCancelled()`
 * between long-running steps and call `stop()` in a finally block to clear
 * the timer.
 *
 * Returning early (rather than throwing) is intentional: throwing would cause
 * SQS to treat the message as a failure and retry it.
 */
export function createCancellationToken(
	jobId: string,
	intervalMs = 5_000,
): CancellationToken {
	let cancelled = false

	const timer = setInterval(() => {
		db.pdfIngestionJob
			.findUnique({
				where: { id: jobId },
				select: { status: true },
			})
			.then((job) => {
				if (job?.status === "cancelled") {
					cancelled = true
					clearInterval(timer)
					logger.info(TAG, "Cancellation detected via poll", { jobId })
				}
			})
			.catch(() => {
				// Ignore transient DB errors — don't disrupt processing due to a poll hiccup
			})
	}, intervalMs)

	return {
		isCancelled: () => cancelled,
		stop: () => clearInterval(timer),
	}
}

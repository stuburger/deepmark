import { db } from "@/db"
import { logger } from "@/lib/infra/logger"
import { parseSqsJobId } from "@/lib/infra/sqs-job-runner"
import type { SqsEvent } from "@/lib/infra/sqs-job-runner"
import type { EnrichmentStatus } from "@mcp-gcse/db"

const TAG = "student-paper-enrich-dlq"

/**
 * DLQ handler for the enrichment queue.
 *
 * Fires when a message exhausts its retries on StudentPaperEnrichQueue.
 * Marks the most recent EnrichmentRun as failed.
 */
export async function handler(event: SqsEvent): Promise<void> {
	for (const record of event.Records) {
		const jobId = parseSqsJobId(record, TAG)
		if (!jobId) continue

		try {
			const run = await db.enrichmentRun.findFirst({
				where: { grading_run_id: jobId },
				orderBy: { created_at: "desc" },
				select: { id: true },
			})

			if (run) {
				await db.enrichmentRun.update({
					where: { id: run.id },
					data: {
						status: "failed" satisfies EnrichmentStatus,
						error: "Annotation generation failed after maximum retries",
					},
				})
			}

			logger.info(TAG, "Enrichment marked as failed from DLQ", { jobId })
		} catch (err) {
			logger.error(TAG, "DLQ handler error", { jobId, error: String(err) })
		}
	}
}

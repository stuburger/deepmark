import { db } from "@/db"
import { logger } from "@/lib/logger"
import {
	type SqsEvent,
	markJobFailed,
	parseSqsJobId,
} from "@/lib/sqs-job-runner"
import { logStudentPaperEvent } from "@mcp-gcse/db"

const TAG = "student-paper-enrich"

/**
 * Stub handler for the enrichment stage of the student paper pipeline.
 *
 * Triggered by StudentPaperEnrichQueue after grading completes.
 * Future work: annotation rendering — embed feedback inline on scanned scripts
 * using per-word bounding boxes (StudentPaperPageToken) and answer regions
 * (StudentPaperAnswerRegion) to produce an annotated PDF per student.
 */
export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []

	for (const record of event.Records) {
		const jobId = parseSqsJobId(record, TAG)
		if (!jobId) continue

		try {
			logger.info(TAG, "Enrich job received", {
				jobId,
				messageId: record.messageId,
			})

			void logStudentPaperEvent(db, jobId, {
				type: "enrich_started",
				at: new Date().toISOString(),
			})

			// TODO: annotation rendering — build annotated PDF from:
			//   - StudentPaperPageToken (word-level bboxes)
			//   - StudentPaperAnswerRegion (per-question spatial bounds)
			//   - grading_results.feedback_summary (per-question feedback text)

			void logStudentPaperEvent(db, jobId, {
				type: "enrich_complete",
				at: new Date().toISOString(),
			})

			logger.info(TAG, "Enrich job complete (stub)", { jobId })
		} catch (err) {
			await markJobFailed(jobId, TAG, "enrich", err)
			failures.push({ itemIdentifier: record.messageId })
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}

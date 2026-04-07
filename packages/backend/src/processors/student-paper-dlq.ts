import { db } from "@/db"
import { logger } from "@/lib/logger"
import type { SqsEvent } from "@/lib/sqs-job-runner"
import { type ScanStatus, logStudentPaperEvent } from "@mcp-gcse/db"

/**
 * Generic DLQ handler for student paper pipeline queues.
 *
 * When a message exhausts its retries on any of the student paper queues
 * (OCR, grading, enrichment), SQS moves it to the DLQ. This handler marks
 * the job as failed so the UI shows a clear error state and the teacher
 * can retry.
 *
 * Determines the failed phase by checking the current job status:
 * - pending/processing/extracting → OCR failed
 * - text_extracted/marking_in_progress → grading failed
 * - ocr_complete + enrichment pending/processing → enrichment failed
 */
export async function handler(event: SqsEvent): Promise<void> {
	for (const record of event.Records) {
		let jobId: string | undefined
		try {
			const body = JSON.parse(record.body) as { job_id?: string }
			jobId = body.job_id
			if (!jobId) {
				logger.warn("student-paper-dlq", "Message missing job_id", {
					messageId: record.messageId,
				})
				continue
			}

			const job = await db.studentPaperJob.findUnique({
				where: { id: jobId },
				select: {
					status: true,
					enrichment_status: true,
					extracted_answers_raw: true,
				},
			})
			if (!job) {
				logger.warn("student-paper-dlq", "Job not found", { jobId })
				continue
			}

			// Determine which phase failed based on current state.
			// Enrichment failures are identified by the main job still being graded
			// ("ocr_complete") while enrichment hasn't completed — the enrich handler
			// only updates enrichment_status and never touches the main job status.
			const isEnrichmentFailure =
				job.status === "ocr_complete" && job.enrichment_status !== "complete"

			if (isEnrichmentFailure) {
				// Enrichment failure — don't change job status, just enrichment_status
				await db.studentPaperJob.update({
					where: { id: jobId },
					data: { enrichment_status: "failed" },
				})
				void logStudentPaperEvent(db, jobId, {
					type: "job_failed",
					at: new Date().toISOString(),
					phase: "enrich",
					error: "Annotation generation failed after maximum retries",
				})
			} else {
				// OCR or grading failure — set job status to failed.
				// Grading phase: status is "text_extracted" (queued but not started) or
				// "grading" / "processing" (actively grading). When status is "processing",
				// distinguish grading from OCR by whether extracted_answers_raw is present.
				const isGradingPhase =
					job.status === "text_extracted" ||
					job.status === "grading" ||
					(job.status === "processing" && job.extracted_answers_raw !== null)

				const phase = isGradingPhase ? "grading" : "ocr"

				await db.studentPaperJob.update({
					where: { id: jobId },
					data: {
						status: "failed" as ScanStatus,
						error: `${phase === "ocr" ? "OCR" : "Grading"} failed after maximum retries`,
					},
				})
				void logStudentPaperEvent(db, jobId, {
					type: "job_failed",
					at: new Date().toISOString(),
					phase,
					error: `${phase === "ocr" ? "OCR" : "Grading"} failed after maximum retries`,
				})
			}

			logger.info("student-paper-dlq", "Job marked as failed from DLQ", {
				jobId,
				phase: isEnrichmentFailure ? "enrich" : "ocr/grading",
			})
		} catch (err) {
			logger.error("student-paper-dlq", "DLQ handler error", {
				jobId,
				error: String(err),
			})
		}
	}
}

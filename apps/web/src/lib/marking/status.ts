import type { GradingStatus, OcrStatus, ScanStatus } from "@mcp-gcse/db"
import type { AnnotationStatus } from "./types"

/**
 * Derives the legacy ScanStatus from the current OcrRun and GradingRun statuses.
 * This keeps the UI working with the same StudentPaperJobPayload shape while
 * reads are flipped to the new domain models.
 */
export function deriveScanStatus(
	ocrStatus: OcrStatus | null,
	gradingStatus: GradingStatus | null,
): ScanStatus {
	// Terminal OCR failure or cancellation wins regardless of grading row state.
	// A grading_runs row is created upfront at submission commit time with
	// status='pending' (see commit-service.ts and marking/stages/mutations.ts),
	// so without this check a genuine OCR failure resolves through the
	// grading-precedence branch below as "text_extracted" — which the UI
	// renders as "Grading queued", masking the failure entirely.
	if (ocrStatus === "failed") return "failed"
	if (ocrStatus === "cancelled") return "cancelled"

	// Grading takes precedence only once it has progressed past `pending`.
	// Same upfront-pending-row reason: a pending grading row isn't yet a
	// meaningful signal, so fall through to OCR to report the real state
	// (e.g. show "Extracting" while OCR is running, not "Grading queued").
	if (gradingStatus && gradingStatus !== "pending") {
		switch (gradingStatus) {
			case "complete":
				return "ocr_complete" // legacy name for "grading complete"
			case "processing":
				return "grading"
			case "failed":
				return "failed"
			case "cancelled":
				return "cancelled"
		}
	}

	if (ocrStatus) {
		switch (ocrStatus) {
			case "complete":
				// OCR done; grading is pending or absent — show "Grading queued".
				return "text_extracted"
			case "processing":
				return "processing"
			case "pending":
				return "pending"
		}
	}

	return "pending"
}

/**
 * Derives annotation status from the grading run's annotation bookkeeping
 * fields. The annotation step runs inside the grade Lambda now — there is no
 * separate enrichment row to look up. Returns `null` when the submission has
 * never been graded.
 */
export function deriveAnnotationStatus(
	grading: {
		status: GradingStatus
		annotations_completed_at: Date | null
		annotation_error: string | null
	} | null,
): AnnotationStatus | null {
	if (!grading) return null
	if (grading.annotation_error) return "failed"
	if (grading.annotations_completed_at) return "complete"
	if (grading.status === "processing") return "processing"
	return "pending"
}

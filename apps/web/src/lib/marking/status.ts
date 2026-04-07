import type { GradingStatus, OcrStatus, ScanStatus } from "@mcp-gcse/db"

/**
 * Derives the legacy ScanStatus from the current OcrRun and GradingRun statuses.
 * This keeps the UI working with the same StudentPaperJobPayload shape while
 * reads are flipped to the new domain models.
 */
export function deriveScanStatus(
	ocrStatus: OcrStatus | null,
	gradingStatus: GradingStatus | null,
): ScanStatus {
	// Grading takes precedence when it exists
	if (gradingStatus) {
		switch (gradingStatus) {
			case "complete":
				return "ocr_complete" // legacy name for "grading complete"
			case "processing":
				return "grading"
			case "failed":
				return "failed"
			case "cancelled":
				return "cancelled"
			case "pending":
				return "text_extracted" // grading queued but not started
		}
	}

	if (ocrStatus) {
		switch (ocrStatus) {
			case "complete":
				return "text_extracted"
			case "processing":
				return "processing"
			case "failed":
				return "failed"
			case "cancelled":
				return "cancelled"
			case "pending":
				return "pending"
		}
	}

	return "pending"
}

import type { StudentPaperJobPayload } from "@/lib/marking/types"

export type MarkingPhase =
	| "scan_processing" // pending / processing (no exam paper linked yet)
	| "marking_in_progress" // answers extracted, grading queued or running
	| "completed" // ocr_complete
	| "failed"
	| "cancelled"

export function derivePhase(data: StudentPaperJobPayload): MarkingPhase {
	if (data.status === "ocr_complete") return "completed"
	if (data.status === "failed") return "failed"
	if (data.status === "cancelled") return "cancelled"
	if (
		(data.status === "processing" ||
			data.status === "text_extracted" ||
			data.status === "grading") &&
		data.exam_paper_id !== null
	)
		return "marking_in_progress"
	return "scan_processing"
}

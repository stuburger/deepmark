import type { StudentPaperJobPayload } from "@/lib/mark-actions"

export type MarkingPhase =
	| "scan_processing" // pending / processing without exam_paper_id
	| "paper_setup" // text_extracted — link student, pick paper
	| "marking_in_progress" // processing with exam_paper_id, grading
	| "completed" // ocr_complete
	| "failed"
	| "cancelled"

export function derivePhase(data: StudentPaperJobPayload): MarkingPhase {
	if (data.status === "ocr_complete") return "completed"
	if (data.status === "text_extracted") return "paper_setup"
	if (data.status === "failed") return "failed"
	if (data.status === "cancelled") return "cancelled"
	if (
		(data.status === "processing" || data.status === "grading") &&
		data.exam_paper_id !== null
	)
		return "marking_in_progress"
	return "scan_processing"
}

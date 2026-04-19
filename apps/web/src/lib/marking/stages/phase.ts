import type { JobStages } from "./types"

/**
 * High-level "where is this submission?" view enum.
 *
 * Purely a UI classification derived from JobStages — JobStages remains the
 * single source of truth for per-stage status. Use this when the UI needs to
 * switch on a single shape ("scan_processing", "completed", etc.) rather than
 * reason about three stage statuses independently.
 */
export type MarkingPhase =
	| "scan_processing" // no exam paper linked yet, or pipeline hasn't started
	| "marking_in_progress" // pipeline is running and an exam paper is linked
	| "completed" // ocr + grading both done (annotation may still be running)
	| "failed"
	| "cancelled"

/**
 * Derives the phase for a submission. `hasExamPaper` is needed because the
 * `scan_processing` / `marking_in_progress` distinction turns on whether a
 * student paper has been linked to an exam paper yet — a property outside
 * the pipeline stage model.
 */
export function derivePhase(
	stages: JobStages,
	hasExamPaper: boolean,
): MarkingPhase {
	const { ocr, grading } = stages

	if (ocr.status === "cancelled" || grading.status === "cancelled") {
		return "cancelled"
	}
	if (ocr.status === "failed" || grading.status === "failed") {
		return "failed"
	}
	if (ocr.status === "done" && grading.status === "done") {
		return "completed"
	}
	if (hasExamPaper) return "marking_in_progress"
	return "scan_processing"
}

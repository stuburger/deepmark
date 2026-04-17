/**
 * Explicit per-stage status model — the single source of truth for pipeline
 * status. The view-level `MarkingPhase` (see `./phase.ts`) is purely derived
 * from this and is used where a component wants to switch on one summary
 * shape rather than reason about three stage statuses independently.
 */

export type StageStatus =
	| "not_started"
	| "generating"
	| "done"
	| "failed"
	| "cancelled"

export type StageKey = "ocr" | "grading" | "enrichment"

export type Stage = {
	status: StageStatus
	runId: string | null
	startedAt: Date | null
	completedAt: Date | null
	error: string | null
}

export type JobStages = {
	jobId: string
	ocr: Stage
	grading: Stage
	enrichment: Stage
}

export type GetJobStagesResult =
	| { ok: true; stages: JobStages }
	| { ok: false; error: string }

const TERMINAL: readonly StageStatus[] = ["done", "failed", "cancelled"]

export function isTerminal(status: StageStatus): boolean {
	return TERMINAL.includes(status)
}

export function allTerminal(stages: JobStages): boolean {
	return (
		isTerminal(stages.ocr.status) &&
		isTerminal(stages.grading.status) &&
		isTerminal(stages.enrichment.status)
	)
}

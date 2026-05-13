// Pure sort utilities shared by submission listing tables. Kept tiny and
// dependency-free so both the paper-detail grid and the cross-paper list can
// import without pulling in render code.

import type { SubmissionHistoryItem } from "../types"
import type { submissionPhase } from "./phase"

export const NAME_COLLATOR = new Intl.Collator("en-GB", { sensitivity: "base" })

/** Phase ordering for status sort. Working states first, terminal states last. */
export const PHASE_RANK: Record<ReturnType<typeof submissionPhase>, number> = {
	extraction: 0,
	grading: 1,
	done: 2,
	error: 3,
}

/** Score percentage; null when not marked or no points available. */
export function pctFor(sub: SubmissionHistoryItem): number | null {
	if (sub.status !== "ocr_complete" || sub.total_max <= 0) return null
	return (sub.total_awarded / sub.total_max) * 100
}

/** Compare with nulls always last, regardless of sort direction. */
export function compareNullable(
	a: number | null,
	b: number | null,
	order: 1 | -1,
): number {
	if (a === null && b === null) return 0
	if (a === null) return 1
	if (b === null) return -1
	return order * (a - b)
}

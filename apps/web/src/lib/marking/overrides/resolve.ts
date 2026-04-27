import type { TeacherOverride } from "@/lib/marking/types"
import type { TeacherOverrideAttrs } from "@mcp-gcse/shared"

/**
 * Unified shape both NodeViews render from. Drops the audit-only fields
 * (`setBy`, `setAt`) since the editor doesn't show them today.
 */
export type ResolvedOverride = {
	score_override: number
	reason: string | null
	feedback_override: string | null
}

/**
 * Pick the authoritative override for a question:
 *   1. Doc attr (written instantly by the dispatch, persisted across reload).
 *   2. PG-projected `TeacherOverride` row (lags ~2s after a snapshot, missing
 *      entirely until the projection lands).
 *   3. `undefined` — no override.
 *
 * Without (1) winning, a reload mid-projection appears to "lose" the
 * teacher's adjustment even though it's safely in the doc.
 *
 * `docOverride.score === null` is treated as "no doc override yet" so the
 * fallback to PG still kicks in for legacy docs that have the attr present
 * but unset.
 */
export function resolveTeacherOverride(
	docOverride: TeacherOverrideAttrs | null,
	docFeedbackOverride: string | null,
	pgRow: TeacherOverride | undefined,
): ResolvedOverride | undefined {
	if (docOverride && docOverride.score !== null) {
		return {
			score_override: docOverride.score,
			reason: docOverride.reason,
			feedback_override: docFeedbackOverride ?? docOverride.feedback,
		}
	}
	if (pgRow) {
		return {
			score_override: pgRow.score_override,
			reason: pgRow.reason,
			feedback_override: pgRow.feedback_override,
		}
	}
	return undefined
}

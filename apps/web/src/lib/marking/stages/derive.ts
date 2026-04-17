import type { EnrichmentStatus, GradingStatus, OcrStatus } from "@mcp-gcse/db"
import type { StageStatus } from "./types"

type RunLikeStatus = OcrStatus | GradingStatus | EnrichmentStatus

/**
 * Maps a DB run status (or null when no row exists) to a UI StageStatus.
 *
 * - No row              → not_started
 * - pending/processing  → generating
 * - complete            → done
 * - failed              → failed
 * - cancelled           → cancelled  (preserved so the submission-level
 *   cancelled phase can render its own panel distinct from failed)
 */
export function deriveStageStatus(status: RunLikeStatus | null): StageStatus {
	if (status === null) return "not_started"
	switch (status) {
		case "pending":
		case "processing":
			return "generating"
		case "complete":
			return "done"
		case "failed":
			return "failed"
		case "cancelled":
			return "cancelled"
	}
}

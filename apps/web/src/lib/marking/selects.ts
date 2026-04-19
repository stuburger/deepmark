import type { Prisma } from "@mcp-gcse/db"

/**
 * Fields that must be read whenever callers need to derive annotation status
 * or surface annotation error messages. Shared between stages/queries.ts and
 * submissions/queries.ts so adding a new annotation bookkeeping field (e.g.
 * `annotation_started_at`) only requires updating one place.
 */
export const ANNOTATION_BOOKKEEPING_SELECT = {
	annotation_error: true,
	annotations_completed_at: true,
} as const satisfies Prisma.GradingRunSelect

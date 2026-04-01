"use server"

/**
 * Re-export barrel — maintained for backwards compatibility while callsites
 * are migrated to import directly from the domain modules below.
 *
 * New code should import from:
 *   @/lib/admin/queries
 *   @/lib/exam-paper/queries
 *   @/lib/exam-paper/mutations
 *   @/lib/exam-paper/questions
 *   @/lib/exam-paper/similarity
 *   @/lib/exam-paper/unlinked-schemes
 *   @/lib/mark-scheme/manual
 */

export * from "./admin/queries"
export * from "./exam-paper/queries"
export * from "./exam-paper/mutations"
export * from "./exam-paper/questions"
export * from "./exam-paper/similarity"
export * from "./exam-paper/unlinked-schemes"
export * from "./mark-scheme/manual"

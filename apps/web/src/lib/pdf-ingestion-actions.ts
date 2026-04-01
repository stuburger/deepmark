"use server"

/**
 * Re-export barrel — maintained for backwards compatibility while callsites
 * are migrated to import directly from the domain modules below.
 *
 * New code should import from:
 *   @/lib/pdf-ingestion/upload
 *   @/lib/pdf-ingestion/job-lifecycle
 *   @/lib/pdf-ingestion/queries
 *   @/lib/pdf-ingestion/exam-paper
 */

export * from "./pdf-ingestion/upload"
export * from "./pdf-ingestion/job-lifecycle"
export * from "./pdf-ingestion/queries"
export * from "./pdf-ingestion/exam-paper"

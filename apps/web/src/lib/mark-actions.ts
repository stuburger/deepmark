"use server"

/**
 * Re-export barrel — maintained for backwards compatibility while callsites
 * are migrated to import directly from the domain modules below.
 *
 * New code should import from:
 *   @/lib/marking/types
 *   @/lib/marking/queries
 *   @/lib/marking/mutations
 */

export * from "./marking/types"
export * from "./marking/queries"
export * from "./marking/mutations"

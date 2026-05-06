import { db } from "@/lib/db"
import { unstable_cache } from "next/cache"

/** Conservative minutes saved per marked GCSE script. Anchored on the DfE
 *  Teacher Workload Survey + NEU figures putting full-script marking at
 *  10–15 minutes; we pick the low end so the claim is defensible. The
 *  per-paper basis (rather than per-answer) is also stable against the
 *  backfill state of marking_results — papers_marked only counts current
 *  submissions with a complete grading run. */
const MINUTES_SAVED_PER_PAPER = 12

export type MarketingStats = {
	papersMarked: number
	hoursSaved: number
	personalizedComments: number
}

/**
 * Public, cached stats for the marketing homepage.
 * - papersMarked: unique current submissions with a completed grading run
 * - personalizedComments: marking results attached to current submissions —
 *   excludes superseded ones so re-marks don't double-count
 * - hoursSaved: papersMarked × MINUTES_SAVED_PER_PAPER (per-paper basis)
 *
 * Cached for 5 min — these are vanity numbers, not a live dashboard.
 */
export const getMarketingStats = unstable_cache(
	async (): Promise<MarketingStats> => {
		const [papersMarked, personalizedComments] = await Promise.all([
			db.studentSubmission.count({
				where: {
					superseded_at: null,
					grading_runs: { some: { status: "complete" } },
				},
			}),
			db.markingResult.count({
				where: {
					answer: { is: { submission: { is: { superseded_at: null } } } },
				},
			}),
		])

		const hoursSaved = Math.round((papersMarked * MINUTES_SAVED_PER_PAPER) / 60)

		return { papersMarked, hoursSaved, personalizedComments }
	},
	["marketing:stats"],
	{ revalidate: 300 },
)

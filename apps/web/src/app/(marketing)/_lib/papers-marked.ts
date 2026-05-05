import { db } from "@/lib/db"
import { unstable_cache } from "next/cache"

/** Seconds saved per marked answer — conservative estimate covering short answers,
 *  extended writing, and MCQ averaged together. Adjust as real-world data accumulates. */
const SECONDS_SAVED_PER_ANSWER = 45

export type MarketingStats = {
	papersMarked: number
	hoursSaved: number
	personalizedComments: number
}

/**
 * Public, cached stats for the marketing homepage.
 * - papersMarked: unique current submissions with a completed grading run
 * - personalizedComments: total marking results (each has a feedback_summary)
 * - hoursSaved: derived from comment count at SECONDS_SAVED_PER_ANSWER per answer
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
			db.markingResult.count(),
		])

		const hoursSaved = Math.round(
			(personalizedComments * SECONDS_SAVED_PER_ANSWER) / 3600,
		)

		return { papersMarked, hoursSaved, personalizedComments }
	},
	["marketing:stats"],
	{ revalidate: 300 },
)

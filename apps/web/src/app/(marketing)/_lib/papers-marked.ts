import { db } from "@/lib/db"
import { unstable_cache } from "next/cache"

/**
 * Public, cached count of papers marked across all teachers.
 * Counts unique current submissions (not superseded re-grades) that have at
 * least one completed grading run. Cached for 5 min — this is a vanity number,
 * not a live dashboard.
 */
export const getPapersMarkedCount = unstable_cache(
	async (): Promise<number> => {
		return db.studentSubmission.count({
			where: {
				superseded_at: null,
				grading_runs: { some: { status: "complete" } },
			},
		})
	},
	["marketing:papers-marked-count"],
	{ revalidate: 300 },
)

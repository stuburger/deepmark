import { db } from "@/lib/db"
import { Resource } from "sst"

/**
 * Count completed grading runs across all submissions uploaded by this user.
 * Naturally counts re-marks (new grading run on same submission) and re-scans
 * (new submission with its own grading run) — both are quota-consuming events.
 */
export async function countCompletedGradingRuns(
	userId: string,
): Promise<number> {
	return db.gradingRun.count({
		where: {
			status: "complete",
			submission: { uploaded_by: userId },
		},
	})
}

export function trialPaperCap(): number {
	return Resource.StripeConfig.trialPaperCap
}

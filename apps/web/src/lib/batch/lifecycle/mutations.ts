"use server"

import { resourceAction } from "@/lib/authz"
import { assertPapersQuota } from "@/lib/billing/entitlement"
import { db } from "@/lib/db"
import { z } from "zod"
import { commitBatchService } from "./commit-service"

export const commitBatch = resourceAction({
	type: "batch",
	role: "editor",
	schema: z.object({ batchJobId: z.string() }),
	id: ({ batchJobId }) => batchJobId,
}).action(
	async ({
		parsedInput: { batchJobId },
		ctx,
	}): Promise<{ studentJobCount: number }> => {
		// Pre-flight quota check: how many net-new submissions would this commit
		// create? Service does the same exclusion (confirmed staged scripts minus
		// already-committed); we replay it here to gate before any work happens.
		// The actual debit (paper_ledger consume rows) is reserved atomically
		// inside commit-service alongside the StudentSubmission/GradingRun
		// creation, so a concurrent commit would fail at the unique-constraint
		// step rather than over-spending.
		const [confirmedScripts, alreadyCommitted] = await Promise.all([
			db.stagedScript.count({
				where: { batch_job_id: batchJobId, status: "confirmed" },
			}),
			db.studentSubmission.count({
				where: { batch_job_id: batchJobId, superseded_at: null },
			}),
		])
		const newSubmissions = Math.max(0, confirmedScripts - alreadyCommitted)
		await assertPapersQuota({
			user: ctx.user,
			additionalPapers: newSubmissions,
		})

		const result = await commitBatchService(batchJobId, ctx.user.id)
		if (!result.ok) throw new Error(result.error)
		ctx.log.info("Batch committed", {
			batchJobId,
			jobCount: result.studentJobCount,
		})
		return { studentJobCount: result.studentJobCount }
	},
)

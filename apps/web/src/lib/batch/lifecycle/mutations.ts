"use server"

import { resourceAction } from "@/lib/authz"
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
		const result = await commitBatchService(batchJobId, ctx.user.id)
		if (!result.ok) throw new Error(result.error)
		ctx.log.info("Batch committed", {
			batchJobId,
			jobCount: result.studentJobCount,
		})
		return { studentJobCount: result.studentJobCount }
	},
)

"use server"

import { resourceAction } from "@/lib/authz"
import { db } from "@/lib/db"
import type { StagedScriptStatus } from "@mcp-gcse/db"
import { z } from "zod"
import { type PageKey, parsePageKeys } from "../types"

const pageKeySchema = z.object({
	s3_key: z.string(),
	order: z.number().int(),
	mime_type: z.string(),
})

export const updateStagedScript = resourceAction({
	type: "stagedScript",
	role: "editor",
	schema: z.object({
		scriptId: z.string(),
		updates: z.object({
			confirmedName: z.string().optional(),
			status: z.enum(["confirmed", "excluded"]).optional(),
		}),
	}),
	id: ({ scriptId }) => scriptId,
}).action(
	async ({ parsedInput: { scriptId, updates } }): Promise<{ ok: true }> => {
		const script = await db.stagedScript.findFirst({
			where: { id: scriptId },
		})
		if (!script) throw new Error("Staged script not found")

		await db.stagedScript.update({
			where: { id: scriptId },
			data: {
				confirmed_name: updates.confirmedName ?? script.confirmed_name,
				status: updates.status ?? script.status,
			},
		})

		return { ok: true }
	},
)

/**
 * Flip every unsubmitted script in a batch to the given status in one UPDATE.
 * Submitted scripts are preserved — they're already committed for marking and
 * can't be toggled back.
 */
export const bulkUpdateStagedScriptStatus = resourceAction({
	type: "batch",
	role: "editor",
	schema: z.object({
		batchId: z.string(),
		status: z.enum(["confirmed", "excluded"]),
	}),
	id: ({ batchId }) => batchId,
}).action(
	async ({ parsedInput: { batchId, status } }): Promise<{ count: number }> => {
		const result = await db.stagedScript.updateMany({
			where: { batch_job_id: batchId, status: { not: "submitted" } },
			data: { status },
		})

		return { count: result.count }
	},
)

export const updateStagedScriptPageKeys = resourceAction({
	type: "stagedScript",
	role: "editor",
	schema: z.object({
		scriptId: z.string(),
		pageKeys: z.array(pageKeySchema),
	}),
	id: ({ scriptId }) => scriptId,
}).action(
	async ({ parsedInput: { scriptId, pageKeys } }): Promise<{ ok: true }> => {
		const script = await db.stagedScript.findFirst({
			where: { id: scriptId },
		})
		if (!script) throw new Error("Staged script not found")

		await db.stagedScript.update({
			where: { id: scriptId },
			data: { page_keys: pageKeys as never },
		})

		return { ok: true }
	},
)

type EmptyStagedScript = {
	id: string
	page_keys: PageKey[]
	proposed_name: null
	confirmed_name: null
	confidence: null
	status: StagedScriptStatus
}

export const createEmptyStagedScript = resourceAction({
	type: "batch",
	role: "editor",
	schema: z.object({ batchJobId: z.string() }),
	id: ({ batchJobId }) => batchJobId,
}).action(
	async ({
		parsedInput: { batchJobId },
	}): Promise<{ script: EmptyStagedScript }> => {
		const batch = await db.batchIngestJob.findFirst({
			where: { id: batchJobId },
			select: { id: true },
		})
		if (!batch) throw new Error("Batch job not found")

		const script = await db.stagedScript.create({
			data: {
				batch_job_id: batchJobId,
				page_keys: [] as never,
				status: "proposed",
			},
		})

		return {
			script: {
				id: script.id,
				page_keys: [],
				proposed_name: null,
				confirmed_name: null,
				confidence: null,
				status: script.status,
			},
		}
	},
)

export const deleteStagedScript = resourceAction({
	type: "stagedScript",
	role: "editor",
	schema: z.object({ scriptId: z.string() }),
	id: ({ scriptId }) => scriptId,
}).action(async ({ parsedInput: { scriptId } }): Promise<{ ok: true }> => {
	const script = await db.stagedScript.findFirst({
		where: { id: scriptId },
	})
	if (!script) throw new Error("Staged script not found")

	await db.stagedScript.delete({ where: { id: scriptId } })

	return { ok: true }
})

export const splitStagedScript = resourceAction({
	type: "stagedScript",
	role: "editor",
	schema: z.object({
		scriptId: z.string(),
		splitAfterIndex: z.number().int(),
	}),
	id: ({ scriptId }) => scriptId,
}).action(
	async ({
		parsedInput: { scriptId, splitAfterIndex },
	}): Promise<{ newScriptId: string }> => {
		const script = await db.stagedScript.findFirst({
			where: { id: scriptId },
		})
		if (!script) throw new Error("Staged script not found")

		const pageKeys = parsePageKeys(script.page_keys)
		if (splitAfterIndex < 0 || splitAfterIndex >= pageKeys.length - 1) {
			throw new Error("Invalid split index")
		}

		const firstHalf = pageKeys.slice(0, splitAfterIndex + 1)
		const secondHalf = pageKeys
			.slice(splitAfterIndex + 1)
			.map((pk, i) => ({ ...pk, order: i + 1 }))

		await db.stagedScript.update({
			where: { id: scriptId },
			data: { page_keys: firstHalf as never },
		})

		const newScript = await db.stagedScript.create({
			data: {
				batch_job_id: script.batch_job_id,
				page_keys: secondHalf as never,
				status: "excluded" as const,
			},
		})

		return { newScriptId: newScript.id }
	},
)

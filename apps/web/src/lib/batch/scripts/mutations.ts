"use server"

import { db } from "@/lib/db"
import type { StagedScriptStatus } from "@mcp-gcse/db"
import { auth } from "../../auth"
import { type PageKey, parsePageKeys } from "../types"

// ─── updateStagedScript ─────────────────────────────────────────────────────

export type UpdateStagedScriptResult =
	| { ok: true }
	| { ok: false; error: string }

export async function updateStagedScript(
	scriptId: string,
	updates: {
		confirmedName?: string
		status?: "confirmed" | "excluded"
	},
): Promise<UpdateStagedScriptResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const script = await db.stagedScript.findFirst({
		where: { id: scriptId },
	})
	if (!script) {
		return { ok: false, error: "Staged script not found" }
	}

	await db.stagedScript.update({
		where: { id: scriptId },
		data: {
			confirmed_name: updates.confirmedName ?? script.confirmed_name,
			status: updates.status ?? script.status,
		},
	})

	return { ok: true }
}

// ─── bulkUpdateStagedScriptStatus ───────────────────────────────────────────

export type BulkUpdateStagedScriptStatusResult =
	| { ok: true; count: number }
	| { ok: false; error: string }

/**
 * Flip every unsubmitted script in a batch to the given status in one UPDATE.
 * Submitted scripts are preserved — they're already committed for marking and
 * can't be toggled back.
 */
export async function bulkUpdateStagedScriptStatus(
	batchId: string,
	status: "confirmed" | "excluded",
): Promise<BulkUpdateStagedScriptStatusResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const result = await db.stagedScript.updateMany({
		where: { batch_job_id: batchId, status: { not: "submitted" } },
		data: { status },
	})

	return { ok: true, count: result.count }
}

// ─── updateStagedScriptPageKeys ─────────────────────────────────────────────

export type UpdateStagedScriptPageKeysResult =
	| { ok: true }
	| { ok: false; error: string }

export async function updateStagedScriptPageKeys(
	scriptId: string,
	pageKeys: PageKey[],
): Promise<UpdateStagedScriptPageKeysResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const script = await db.stagedScript.findFirst({
		where: { id: scriptId },
	})
	if (!script) {
		return { ok: false, error: "Staged script not found" }
	}

	await db.stagedScript.update({
		where: { id: scriptId },
		data: { page_keys: pageKeys as never },
	})

	return { ok: true }
}

// ─── createEmptyStagedScript ────────────────────────────────────────────────

export type CreateEmptyStagedScriptResult =
	| {
			ok: true
			script: {
				id: string
				page_keys: []
				proposed_name: null
				confirmed_name: null
				confidence: null
				status: StagedScriptStatus
			}
	  }
	| { ok: false; error: string }

export async function createEmptyStagedScript(
	batchJobId: string,
): Promise<CreateEmptyStagedScriptResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const batch = await db.batchIngestJob.findFirst({
		where: { id: batchJobId },
		select: { id: true },
	})
	if (!batch) return { ok: false, error: "Batch job not found" }

	const script = await db.stagedScript.create({
		data: {
			batch_job_id: batchJobId,
			page_keys: [] as never,
			status: "proposed",
		},
	})

	return {
		ok: true,
		script: {
			id: script.id,
			page_keys: [],
			proposed_name: null,
			confirmed_name: null,
			confidence: null,
			status: script.status,
		},
	}
}

// ─── deleteStagedScript ─────────────────────────────────────────────────────

export type DeleteStagedScriptResult =
	| { ok: true }
	| { ok: false; error: string }

export async function deleteStagedScript(
	scriptId: string,
): Promise<DeleteStagedScriptResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const script = await db.stagedScript.findFirst({
		where: { id: scriptId },
	})
	if (!script) {
		return { ok: false, error: "Staged script not found" }
	}

	await db.stagedScript.delete({ where: { id: scriptId } })

	return { ok: true }
}

// ─── splitStagedScript ──────────────────────────────────────────────────────

export type SplitStagedScriptResult =
	| { ok: true; newScriptId: string }
	| { ok: false; error: string }

export async function splitStagedScript(
	scriptId: string,
	splitAfterIndex: number,
): Promise<SplitStagedScriptResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const script = await db.stagedScript.findFirst({
		where: { id: scriptId },
	})
	if (!script) {
		return { ok: false, error: "Staged script not found" }
	}

	const pageKeys = parsePageKeys(script.page_keys)
	if (splitAfterIndex < 0 || splitAfterIndex >= pageKeys.length - 1) {
		return { ok: false, error: "Invalid split index" }
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

	return { ok: true, newScriptId: newScript.id }
}

"use server"

import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import type { LlmCallSiteRow, LlmModelEntry } from "./llm-types"

const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

export type ListLlmCallSitesResult =
	| { ok: true; callSites: LlmCallSiteRow[] }
	| { ok: false; error: string }

export async function listLlmCallSites(): Promise<ListLlmCallSitesResult> {
	try {
		const rows = await db.llmCallSite.findMany({
			orderBy: { display_name: "asc" },
		})
		const callSites: LlmCallSiteRow[] = rows.map((r) => ({
			id: r.id,
			key: r.key,
			display_name: r.display_name,
			description: r.description,
			input_type: r.input_type,
			models: r.models as LlmModelEntry[],
			updated_by: r.updated_by,
			updated_at: r.updated_at,
		}))
		return { ok: true, callSites }
	} catch {
		return { ok: false, error: "Failed to load LLM call sites" }
	}
}

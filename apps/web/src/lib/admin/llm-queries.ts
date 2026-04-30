"use server"

import { adminAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { LLM_CALL_SITE_DEFAULTS } from "@mcp-gcse/shared"
import type { LlmCallSiteRow, LlmModelEntry } from "./llm-types"

/** Canonical sort order: matches the phase + temporal order in LLM_CALL_SITE_DEFAULTS. */
const KEY_ORDER = new Map(LLM_CALL_SITE_DEFAULTS.map((d, i) => [d.key, i]))

export const listLlmCallSites = adminAction.action(
	async (): Promise<{ callSites: LlmCallSiteRow[] }> => {
		const rows = await db.llmCallSite.findMany()
		const callSites: LlmCallSiteRow[] = rows
			.map((r) => ({
				id: r.id,
				key: r.key,
				display_name: r.display_name,
				description: r.description,
				input_type: r.input_type,
				phase: r.phase,
				models: r.models as LlmModelEntry[],
				updated_by: r.updated_by,
				updated_at: r.updated_at,
			}))
			.sort(
				(a, b) => (KEY_ORDER.get(a.key) ?? 999) - (KEY_ORDER.get(b.key) ?? 999),
			)
		return { callSites }
	},
)

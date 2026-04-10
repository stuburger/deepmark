import { db } from "@/db"
import { LLM_CALL_SITE_DEFAULTS, type LlmModelEntry } from "@mcp-gcse/shared"

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

type CacheEntry = {
	models: LlmModelEntry[]
	expiresAt: number
}

const cache = new Map<string, CacheEntry>()

/**
 * Loads the model fallback chain for a call site from the DB.
 * Uses a 5-minute in-process cache to avoid redundant DB reads
 * within a warm Lambda execution environment.
 *
 * Falls back to LLM_CALL_SITE_DEFAULTS if the key is not in the DB.
 */
export async function getLlmConfig(key: string): Promise<LlmModelEntry[]> {
	const now = Date.now()
	const cached = cache.get(key)
	if (cached && cached.expiresAt > now) {
		return cached.models
	}

	try {
		const row = await db.llmCallSite.findUnique({ where: { key } })
		if (row) {
			const models = row.models as LlmModelEntry[]
			cache.set(key, { models, expiresAt: now + CACHE_TTL_MS })
			return models
		}
	} catch {
		// DB unreachable — fall through to defaults
	}

	const def = LLM_CALL_SITE_DEFAULTS.find((d) => d.key === key)
	if (def) {
		cache.set(key, { models: def.models, expiresAt: now + CACHE_TTL_MS })
		return def.models
	}

	throw new Error(`No LLM config found for call site "${key}"`)
}

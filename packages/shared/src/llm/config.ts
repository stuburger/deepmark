import { LLM_CALL_SITE_DEFAULTS } from "./types"
import type { LlmModelEntry } from "./types"

const CACHE_TTL_MS = 0 // 5 * 60 * 1000

type CacheEntry = {
	models: LlmModelEntry[]
	expiresAt: number
}

const cache = new Map<string, CacheEntry>()

/**
 * Loads the model fallback chain for a call site, with in-process caching
 * and fallback to hardcoded defaults.
 *
 * Pure function — the caller provides the DB lookup. This keeps packages/shared
 * free of SST and Prisma dependencies.
 *
 * @param key The call site key (e.g. "grading", "handwriting-ocr")
 * @param dbLookup Async function that reads the models JSON from the DB. Returns null if not found.
 */
export async function getLlmConfig(
	key: string,
	dbLookup: (key: string) => Promise<LlmModelEntry[] | null>,
): Promise<LlmModelEntry[]> {
	const now = Date.now()
	const cached = cache.get(key)
	if (cached && cached.expiresAt > now) {
		return cached.models
	}

	try {
		const models = await dbLookup(key)
		if (models) {
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

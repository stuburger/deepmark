import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createPrismaClient } from "@mcp-gcse/db"
import {
	LLM_CALL_SITE_DEFAULTS,
	type LlmModelEntry,
	type LlmProvider,
	type ProviderClient,
	createModelResolver,
	callWithFallback as sharedCallWithFallback,
} from "@mcp-gcse/shared"
import type { LanguageModel } from "ai"
import { Resource } from "sst"

// ── Config loading (mirrors backend/src/lib/infra/llm-config.ts) ─────────────

const CACHE_TTL_MS = 5 * 60 * 1000

type CacheEntry = {
	models: LlmModelEntry[]
	expiresAt: number
}

const cache = new Map<string, CacheEntry>()

async function getLlmConfig(key: string): Promise<LlmModelEntry[]> {
	const now = Date.now()
	const cached = cache.get(key)
	if (cached && cached.expiresAt > now) {
		return cached.models
	}

	try {
		const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)
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

// ── Provider resolution ──────────────────────────────────────────────────────

let providers: Record<LlmProvider, ProviderClient> | null = null

function getProviders(): Record<LlmProvider, ProviderClient> {
	if (!providers) {
		const google = createGoogleGenerativeAI({
			apiKey: Resource.GeminiApiKey.value,
		})
		const openai = createOpenAI({
			apiKey: Resource.OpenAiApiKey.value,
		})
		const anthropic = createAnthropic({
			apiKey: Resource.AnthropicApiKey.value,
		})
		providers = {
			google: (modelId: string) => google(modelId),
			openai: (modelId: string) => openai(modelId),
			anthropic: (modelId: string) => anthropic(modelId),
		}
	}
	return providers
}

export function resolveModel(entry: LlmModelEntry): LanguageModel {
	const resolve = createModelResolver(getProviders())
	return resolve(entry)
}

/**
 * Loads the model config for a call site and executes with fallback.
 * Web-side equivalent of the backend callLlmWithFallback.
 */
export async function callLlmWithFallback<T>(
	callSiteKey: string,
	fn: (model: LanguageModel, entry: LlmModelEntry) => Promise<T>,
): Promise<T> {
	const models = await getLlmConfig(callSiteKey)
	return sharedCallWithFallback(models, resolveModel, fn, {
		callSiteKey,
	})
}

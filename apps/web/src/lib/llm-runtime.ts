import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createPrismaClient } from "@mcp-gcse/db"
import {
	type LlmModelEntry,
	type LlmProvider,
	type ProviderClient,
	createModelResolver,
	callWithFallback as sharedCallWithFallback,
	getLlmConfig as sharedGetLlmConfig,
} from "@mcp-gcse/shared"
import type { LanguageModel } from "ai"
import { Resource } from "sst"

// ── Config loading ───────────────────────────────────────────────────────────

async function getLlmConfig(key: string): Promise<LlmModelEntry[]> {
	return sharedGetLlmConfig(key, async (k) => {
		const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)
		const row = await db.llmCallSite.findUnique({ where: { key: k } })
		return row ? (row.models as LlmModelEntry[]) : null
	})
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

import { db } from "@/lib/db"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import {
	type LlmCallReport,
	type LlmModelEntry,
	type LlmProvider,
	LlmRunner,
	type ProviderClient,
	createModelResolver,
	getLlmConfig as sharedGetLlmConfig,
} from "@mcp-gcse/shared"
import type { LanguageModel } from "ai"
import { Resource } from "sst"

// ── Config loading ───────────────────────────────────────────────────────────

async function getLlmConfig(key: string): Promise<LlmModelEntry[]> {
	return sharedGetLlmConfig(key, async (k) => {
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

// ── Default runner (singleton for non-run call sites) ───────────────────────

let _defaultRunner: LlmRunner | null = null

export function getDefaultRunner(): LlmRunner {
	if (!_defaultRunner) {
		_defaultRunner = new LlmRunner({
			getConfig: getLlmConfig,
			resolveModel,
		})
	}
	return _defaultRunner
}

/**
 * Loads the model config for a call site and executes with fallback.
 * Web-side equivalent of the backend callLlmWithFallback.
 */
export async function callLlmWithFallback<T>(
	callSiteKey: string,
	fn: (
		model: LanguageModel,
		entry: LlmModelEntry,
		report: LlmCallReport,
	) => Promise<T>,
	llm?: LlmRunner,
): Promise<T> {
	return (llm ?? getDefaultRunner()).call(callSiteKey, fn)
}

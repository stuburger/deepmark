import { logger } from "@/lib/infra/logger"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import {
	type LlmModelEntry,
	type LlmProvider,
	LlmRunner,
	type ProviderClient,
	createModelResolver,
	callWithFallback as sharedCallWithFallback,
} from "@mcp-gcse/shared"
import type { LanguageModel } from "ai"
import { Resource } from "sst"
import { getLlmConfig } from "./llm-config"

// Lazy-initialized provider clients — created on first use to avoid
// accessing SST Resource secrets until they're actually needed.
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

/**
 * Resolves an LlmModelEntry to a Vercel AI SDK LanguageModel.
 * Uses lazy-initialized provider clients backed by SST secrets.
 */
export function resolveModel(entry: LlmModelEntry): LanguageModel {
	const resolve = createModelResolver(getProviders())
	return resolve(entry)
}

/**
 * Loads the model config for a call site and executes with fallback.
 *
 * Combines getLlmConfig (DB + cache) → resolveModel (SST secrets) → callWithFallback (shared logic).
 */
/**
 * Loads the model config for a call site and executes with fallback.
 *
 * For call sites that are NOT part of a run (MCP tools, autofill, etc.).
 * For run-scoped calls, use `createLlmRunner()` instead.
 */
export async function callLlmWithFallback<T>(
	callSiteKey: string,
	fn: (model: LanguageModel, entry: LlmModelEntry) => Promise<T>,
): Promise<T> {
	const models = await getLlmConfig(callSiteKey)
	return sharedCallWithFallback(models, resolveModel, fn, {
		callSiteKey,
		logger,
	})
}

/**
 * Creates a per-run LlmRunner that records which models were configured
 * and which actually executed, for snapshot persistence on run records.
 */
export function createLlmRunner(
	overrides?: Record<string, LlmModelEntry[]>,
): LlmRunner {
	return new LlmRunner(
		{ getConfig: getLlmConfig, resolveModel, logger },
		overrides,
	)
}

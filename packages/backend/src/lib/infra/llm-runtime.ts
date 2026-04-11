import { logger } from "@/lib/infra/logger"
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

// ── Default runner (singleton for non-run call sites) ───────────────────────

let _defaultRunner: LlmRunner | null = null

function getDefaultRunner(): LlmRunner {
	if (!_defaultRunner) {
		_defaultRunner = new LlmRunner({
			getConfig: getLlmConfig,
			resolveModel,
			logger,
		})
	}
	return _defaultRunner
}

/**
 * Loads the model config for a call site and executes with fallback.
 *
 * When `llm` is provided (run-scoped), delegates to the runner which
 * records selected/effective config for the snapshot. When omitted,
 * uses a shared default runner (no snapshot persistence).
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

import type { LanguageModel } from "ai"
import type { LlmModelEntry, LlmProvider } from "./types"

/**
 * A pre-configured provider client that can create model instances.
 * Each provider SDK (Google, OpenAI, Anthropic) returns a function
 * like this: `provider(modelId) → LanguageModel`.
 */
export type ProviderClient = (modelId: string) => LanguageModel

/**
 * Creates a model resolver from pre-built provider clients.
 *
 * The caller (in packages/backend or apps/web) is responsible for
 * creating the provider clients using SST secrets:
 *
 * ```ts
 * const providers = {
 *   google: createGoogleGenerativeAI({ apiKey: Resource.GeminiApiKey.value }),
 *   openai: createOpenAI({ apiKey: Resource.OpenAiApiKey.value }),
 *   anthropic: createAnthropic({ apiKey: Resource.AnthropicApiKey.value }),
 * }
 * const resolve = createModelResolver(providers)
 * ```
 */
export function createModelResolver(
	providers: Partial<Record<LlmProvider, ProviderClient>>,
): (entry: LlmModelEntry) => LanguageModel {
	return (entry: LlmModelEntry): LanguageModel => {
		const provider = providers[entry.provider]
		if (!provider) {
			throw new Error(
				`No provider client configured for "${entry.provider}". Ensure the API key is set and the provider SDK is installed.`,
			)
		}
		return provider(entry.model)
	}
}

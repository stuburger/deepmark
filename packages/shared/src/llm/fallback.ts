import type { LanguageModel } from "ai"
import type { LlmModelEntry } from "./types"

export type FallbackLogger = {
	warn: (tag: string, message: string, meta?: Record<string, unknown>) => void
	info: (tag: string, message: string, meta?: Record<string, unknown>) => void
}

export type ModelResolver = (entry: LlmModelEntry) => LanguageModel

/**
 * Tries each model in the fallback chain in order.
 * On error, logs and tries the next model. Throws after all models are exhausted.
 *
 * Pure function — no SST or DB dependencies. The caller provides
 * the resolver (which maps LlmModelEntry → LanguageModel) and an optional logger.
 */
export async function callWithFallback<T>(
	models: LlmModelEntry[],
	resolveModel: ModelResolver,
	fn: (model: LanguageModel, entry: LlmModelEntry) => Promise<T>,
	opts?: {
		callSiteKey?: string
		logger?: FallbackLogger
	},
): Promise<T> {
	if (models.length === 0) {
		throw new Error(
			`No models configured for call site "${opts?.callSiteKey ?? "unknown"}"`,
		)
	}

	let lastError: unknown
	for (let i = 0; i < models.length; i++) {
		const entry = models[i]
		const model = resolveModel(entry)
		const isPrimary = i === 0
		try {
			const result = await fn(model, entry)
			if (!isPrimary) {
				opts?.logger?.info("llm-fallback", "Fallback succeeded", {
					callSite: opts?.callSiteKey,
					provider: entry.provider,
					model: entry.model,
					attemptIndex: i,
				})
			}
			return result
		} catch (err) {
			lastError = err
			const errorMessage = err instanceof Error ? err.message : String(err)
			opts?.logger?.warn("llm-fallback", "Model call failed", {
				callSite: opts?.callSiteKey,
				provider: entry.provider,
				model: entry.model,
				attemptIndex: i,
				isLast: i === models.length - 1,
				error: errorMessage,
			})
		}
	}

	throw lastError
}

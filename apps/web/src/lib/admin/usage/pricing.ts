// ─── Model Pricing (USD per 1M tokens) ──────────────────────────────────────
// Approximate rates — update as pricing changes.

type ModelPricing = { prompt: number; completion: number }

const MODEL_PRICING: Record<string, ModelPricing> = {
	// Google
	"gemini-2.5-flash": { prompt: 0.075, completion: 0.3 },
	"gemini-2.5-flash-preview-04-17": { prompt: 0.075, completion: 0.3 },
	"gemini-3-pro-preview": { prompt: 1.25, completion: 5.0 },
	"gemini-3.1-pro-preview": { prompt: 1.25, completion: 5.0 },
	// Anthropic
	"claude-haiku-4-5": { prompt: 0.8, completion: 4.0 },
	"claude-sonnet-4-6": { prompt: 3.0, completion: 15.0 },
	"claude-sonnet-4-20250514": { prompt: 3.0, completion: 15.0 },
	"claude-opus-4-6": { prompt: 15.0, completion: 75.0 },
}

const FALLBACK_PRICING: ModelPricing = { prompt: 1.0, completion: 5.0 }

/** Estimate cost in USD for a given model and token counts. */
export function estimateCost(
	model: string,
	promptTokens: number,
	completionTokens: number,
): number {
	const pricing = MODEL_PRICING[model] ?? FALLBACK_PRICING
	return (
		(promptTokens / 1_000_000) * pricing.prompt +
		(completionTokens / 1_000_000) * pricing.completion
	)
}

/** Format a USD cost for display. */
export function formatCost(usd: number): string {
	if (usd < 0.01) return "<$0.01"
	return `$${usd.toFixed(2)}`
}

/** Format a token count with K/M suffix. */
export function formatTokens(count: number): string {
	if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
	if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
	return count.toLocaleString()
}

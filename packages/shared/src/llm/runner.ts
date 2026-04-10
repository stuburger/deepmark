import type { LanguageModel } from "ai"
import { z } from "zod"
import {
	type FallbackLogger,
	type ModelResolver,
	callWithFallback,
} from "./fallback"
import type { LlmModelEntry, LlmProvider } from "./types"

// ── Snapshot types ──────────────────────────────────────────────────────────

export type EffectiveSummary = {
	total_calls: number
	fallback_calls: number
}

export type LlmRunSnapshot = {
	/** Full model chain configured for each call site at run time. */
	selected: Record<string, LlmModelEntry[]>
	/** Per-call-site summary of what actually executed. */
	effective: Record<string, EffectiveSummary>
}

// ── Zod schemas ─────────────────────────────────────────────────────────────

export const LlmModelEntrySchema = z.object({
	provider: z.enum(["google", "openai", "anthropic"]),
	model: z.string(),
	temperature: z.number(),
})

const EffectiveSummarySchema = z.object({
	total_calls: z.number().int().nonnegative(),
	fallback_calls: z.number().int().nonnegative(),
})

export const LlmRunSnapshotSchema = z.object({
	selected: z.record(z.string(), z.array(LlmModelEntrySchema)),
	effective: z.record(z.string(), EffectiveSummarySchema),
})

// ── Runner deps ─────────────────────────────────────────────────────────────

export type LlmRunnerDeps = {
	getConfig: (key: string) => Promise<LlmModelEntry[]>
	resolveModel: ModelResolver
	logger?: FallbackLogger
}

// ── LlmRunner ───────────────────────────────────────────────────────────────

/**
 * Per-run LLM service that executes calls with fallback and accumulates
 * a snapshot of which models were configured (selected) and which actually
 * ran (effective).
 *
 * Lives in `packages/shared` — pure, no SST deps. Callers inject
 * config loading and model resolution via `LlmRunnerDeps`.
 */
export class LlmRunner {
	private selected: Record<string, LlmModelEntry[]> = {}
	private effective: Record<string, EffectiveSummary> = {}
	private overrides: Record<string, LlmModelEntry[]>
	private deps: LlmRunnerDeps

	constructor(
		deps: LlmRunnerDeps,
		overrides?: Record<string, LlmModelEntry[]>,
	) {
		this.deps = deps
		this.overrides = overrides ?? {}
	}

	/** Execute an LLM call with fallback, recording to the snapshot. */
	async call<T>(
		callSiteKey: string,
		fn: (model: LanguageModel, entry: LlmModelEntry) => Promise<T>,
	): Promise<T> {
		const models = await this.resolveConfig(callSiteKey)

		return callWithFallback(models, this.deps.resolveModel, fn, {
			callSiteKey,
			logger: this.deps.logger,
			onEffective: (_entry, attemptIndex) => {
				this.recordEffective(callSiteKey, attemptIndex)
			},
		})
	}

	/** Returns a Zod-validated deep clone of the accumulated snapshot. */
	toSnapshot(): LlmRunSnapshot {
		return LlmRunSnapshotSchema.parse({
			selected: structuredClone(this.selected),
			effective: structuredClone(this.effective),
		})
	}

	// ── Internal ──────────────────────────────────────────────────────────────

	private async resolveConfig(callSiteKey: string): Promise<LlmModelEntry[]> {
		const models =
			this.overrides[callSiteKey] ?? (await this.deps.getConfig(callSiteKey))
		this.selected[callSiteKey] ??= models
		return models
	}

	private recordEffective(callSiteKey: string, attemptIndex: number): void {
		if (!this.effective[callSiteKey]) {
			this.effective[callSiteKey] = { total_calls: 0, fallback_calls: 0 }
		}
		const summary = this.effective[callSiteKey]
		summary.total_calls++
		if (attemptIndex > 0) summary.fallback_calls++
	}
}

import type { LanguageModel } from "ai"
import { z } from "zod/v4"
import {
	type FallbackLogger,
	type ModelResolver,
	callWithFallback,
} from "./fallback"
import type { LlmModelEntry, LlmProvider } from "./types"

/**
 * Default per-attempt wall-clock budget for an LLM call. Suits the typical
 * single-page OCR / structured-extraction call (5–30s observed). Call sites
 * with a known higher budget (multi-page attribution, long completions)
 * should pass an explicit `timeoutMs` to `LlmRunner.call`.
 *
 * Why 90s and why we keep it: this is a deliberate canary, not a per-call
 * ceiling. The vast majority of our LLM calls finish in well under 30s; a
 * call that runs past 90s is almost always genuinely stuck (model loop,
 * upstream throttling, network blackhole) and burning money for no return.
 * The pre-launch operating mode in CLAUDE.md treats wasted LLM seconds as
 * money flowing out of the founder's pocket, so the floor stays tight to
 * fail those fast.
 *
 * Outliers go through opt-in `timeoutMs` overrides at the call site —
 * `pdf-script-segmentation` is the canonical example: it derives its
 * budget from the Lambda's remaining execution time when invoked from
 * SQS, and falls back to this default when invoked outside Lambda (tests,
 * web server actions). Don't bump the default just to fit one call site.
 */
export const DEFAULT_LLM_TIMEOUT_MS = 90_000

/**
 * Thrown when an LLM call exceeds its wall-clock budget. The fallback chain
 * treats this like any other error — it'll try the next model in the chain.
 * If every model in the chain times out, this surfaces to the caller.
 */
export class LlmTimeoutError extends Error {
	readonly callSiteKey: string
	readonly timeoutMs: number
	constructor(callSiteKey: string, timeoutMs: number) {
		super(
			`LLM call '${callSiteKey}' exceeded wall-clock timeout of ${timeoutMs}ms`,
		)
		this.name = "LlmTimeoutError"
		this.callSiteKey = callSiteKey
		this.timeoutMs = timeoutMs
	}
}

/**
 * Runs `fn` with an AbortController-backed wall-clock budget. When the
 * timeout fires, the controller is aborted (so the underlying fetch is
 * cancelled if the call site forwarded the signal to `generateText`) AND
 * the outer await rejects via Promise.race (so call sites that ignored the
 * signal don't hang the Lambda).
 *
 * Catches an `AbortError` rejected by the SDK and rewrites it to
 * `LlmTimeoutError` so callers get a consistent, descriptive error.
 *
 * On timeout, emits a structured `llm-timeout` log via the supplied
 * logger. That's the only signal we have for tuning the timeout budgets
 * post-hoc — without it we'd be picking numbers from anecdotes.
 */
async function withTimeout<T>(
	fn: (signal: AbortSignal) => Promise<T>,
	timeoutMs: number,
	callSiteKey: string,
	logger?: FallbackLogger,
): Promise<T> {
	const controller = new AbortController()
	const startedAt = Date.now()
	let timedOut = false
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeoutPromise = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			timedOut = true
			controller.abort()
			logger?.warn("llm-timeout", "LLM call exceeded wall-clock budget", {
				callSiteKey,
				timeoutMs,
				signalForwarded: controller.signal.aborted,
			})
			reject(new LlmTimeoutError(callSiteKey, timeoutMs))
		}, timeoutMs)
	})

	try {
		return await Promise.race([fn(controller.signal), timeoutPromise])
	} catch (err) {
		// SDK rejected via the abort signal we triggered — surface as timeout.
		if (timedOut && !(err instanceof LlmTimeoutError)) {
			logger?.warn(
				"llm-timeout",
				"LLM call rejected via abort after timeout fired",
				{
					callSiteKey,
					timeoutMs,
					elapsedMs: Date.now() - startedAt,
					sdkError: err instanceof Error ? err.message : String(err),
				},
			)
			throw new LlmTimeoutError(callSiteKey, timeoutMs)
		}
		throw err
	} finally {
		if (timer) clearTimeout(timer)
	}
}

// ── Snapshot types ──────────────────────────────────────────────────────────

export type EffectiveSummary = {
	total_calls: number
	fallback_calls: number
	prompt_tokens: number
	completion_tokens: number
}

export type LlmRunSnapshot = {
	/** Full model chain configured for each call site at run time. */
	selected: Record<string, LlmModelEntry[]>
	/** Per-call-site summary of what actually executed. */
	effective: Record<string, EffectiveSummary>
}

/**
 * Mutable bag passed into the `call()` callback so call sites can
 * report token usage from the `generateText` result.
 *
 * Usage: `report.usage = result.usage` after the `generateText` call.
 * Field names match the Vercel AI SDK's `LanguageModelUsage` type.
 */
export type LlmCallReport = {
	usage?: {
		inputTokens: number | undefined
		outputTokens: number | undefined
	}
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
	prompt_tokens: z.number().int().nonnegative(),
	completion_tokens: z.number().int().nonnegative(),
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
 * ran (effective), including token usage.
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

	/**
	 * Execute an LLM call with fallback, recording to the snapshot.
	 *
	 * The callback receives a `report` bag — set `report.usage = result.usage`
	 * after your `generateText` call to capture token counts in the snapshot.
	 *
	 * The 4th `signal` argument is an `AbortSignal` driven by the per-attempt
	 * wall-clock timeout. Forward it to `generateText({ ..., abortSignal: signal })`
	 * so a hung Gemini/OpenAI/Anthropic call is genuinely cancelled (not just
	 * orphaned). Call sites that ignore the signal still benefit from the
	 * timeout via Promise.race — but the underlying fetch keeps running and
	 * keeps costing money until the LLM returns.
	 *
	 * Each attempt in the fallback chain gets its own fresh timeout.
	 */
	async call<T>(
		callSiteKey: string,
		fn: (
			model: LanguageModel,
			entry: LlmModelEntry,
			report: LlmCallReport,
			signal: AbortSignal,
		) => Promise<T>,
		opts?: { timeoutMs?: number },
	): Promise<T> {
		const models = await this.resolveConfig(callSiteKey)
		const report: LlmCallReport = {}
		const timeoutMs = opts?.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS

		const result = await callWithFallback(
			models,
			this.deps.resolveModel,
			(model, entry) =>
				withTimeout(
					(signal) => fn(model, entry, report, signal),
					timeoutMs,
					callSiteKey,
					this.deps.logger,
				),
			{
				callSiteKey,
				logger: this.deps.logger,
				onEffective: (_entry, attemptIndex) => {
					this.recordEffective(callSiteKey, attemptIndex, report)
				},
			},
		)

		return result
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

	private recordEffective(
		callSiteKey: string,
		attemptIndex: number,
		report: LlmCallReport,
	): void {
		if (!this.effective[callSiteKey]) {
			this.effective[callSiteKey] = {
				total_calls: 0,
				fallback_calls: 0,
				prompt_tokens: 0,
				completion_tokens: 0,
			}
		}
		const summary = this.effective[callSiteKey]
		summary.total_calls++
		if (attemptIndex > 0) summary.fallback_calls++
		if (report.usage) {
			summary.prompt_tokens += report.usage.inputTokens ?? 0
			summary.completion_tokens += report.usage.outputTokens ?? 0
		}
	}
}

import type { LanguageModel } from "ai"
import { describe, expect, it, vi } from "vitest"
import {
	DEFAULT_LLM_TIMEOUT_MS,
	LlmRunSnapshotSchema,
	LlmRunner,
	LlmTimeoutError,
	clampLlmTimeoutMs,
} from "../../src/llm/runner"
import type { LlmModelEntry } from "../../src/llm/types"

// ── Test helpers ────────────────────────────────────────────────────────────

function stubModel(id: string): LanguageModel {
	return { modelId: id } as unknown as LanguageModel
}

const GOOGLE_FLASH: LlmModelEntry = {
	provider: "google",
	model: "gemini-2.5-flash",
	temperature: 0.1,
}

const OPENAI_GPT4O: LlmModelEntry = {
	provider: "openai",
	model: "gpt-4o",
	temperature: 0.7,
}

/** Effective summary with zero tokens — convenience for assertions. */
function eff(total_calls: number, fallback_calls: number) {
	return { total_calls, fallback_calls, prompt_tokens: 0, completion_tokens: 0 }
}

function createRunner(
	config: Record<string, LlmModelEntry[]> = { grading: [GOOGLE_FLASH] },
	overrides?: Record<string, LlmModelEntry[]>,
) {
	const getConfig = vi.fn(async (key: string) => config[key] ?? [])
	const resolveModel = vi.fn((entry: LlmModelEntry) =>
		stubModel(`${entry.provider}/${entry.model}`),
	)
	const logger = { warn: vi.fn(), info: vi.fn() }
	const runner = new LlmRunner(
		{ getConfig, resolveModel, logger },
		overrides,
	)
	return { runner, getConfig, resolveModel, logger }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("LlmRunner", () => {
	it("records selected config on call()", async () => {
		const { runner } = createRunner({ grading: [GOOGLE_FLASH] })

		await runner.call("grading", async () => "result")

		const snapshot = runner.toSnapshot()
		expect(snapshot.selected.grading).toEqual([GOOGLE_FLASH])
	})

	it("records effective summary across multiple calls", async () => {
		const { runner } = createRunner({ grading: [GOOGLE_FLASH] })

		await runner.call("grading", async () => "a")
		await runner.call("grading", async () => "b")

		const snapshot = runner.toSnapshot()
		expect(snapshot.effective.grading).toEqual(eff(2, 0))
	})

	it("records fallback when primary model fails", async () => {
		const { runner } = createRunner({
			grading: [GOOGLE_FLASH, OPENAI_GPT4O],
		})

		let callCount = 0
		await runner.call("grading", async (model) => {
			callCount++
			if (
				(model as unknown as { modelId: string }).modelId.includes("google")
			) {
				throw new Error("Google failed")
			}
			return "fallback-result"
		})

		const snapshot = runner.toSnapshot()
		expect(snapshot.effective.grading).toEqual(eff(1, 1))
		expect(callCount).toBe(2)
	})

	it("throws when all models fail", async () => {
		const { runner } = createRunner({
			grading: [GOOGLE_FLASH, OPENAI_GPT4O],
		})

		await expect(
			runner.call("grading", async () => {
				throw new Error("fail")
			}),
		).rejects.toThrow("fail")

		const snapshot = runner.toSnapshot()
		expect(snapshot.effective.grading).toBeUndefined()
	})

	it("tracks multiple call sites independently", async () => {
		const { runner } = createRunner({
			grading: [GOOGLE_FLASH],
			ocr: [OPENAI_GPT4O],
		})

		await runner.call("grading", async () => "a")
		await runner.call("grading", async () => "b")
		await runner.call("ocr", async () => "c")

		const snapshot = runner.toSnapshot()
		expect(snapshot.effective.grading).toEqual(eff(2, 0))
		expect(snapshot.effective.ocr).toEqual(eff(1, 0))
	})

	it("uses override instead of getConfig", async () => {
		const { runner, getConfig } = createRunner(
			{ grading: [GOOGLE_FLASH] },
			{ grading: [OPENAI_GPT4O] },
		)

		await runner.call("grading", async () => "result")

		expect(getConfig).not.toHaveBeenCalled()
		expect(runner.toSnapshot().selected.grading).toEqual([OPENAI_GPT4O])
	})

	it("supports partial overrides", async () => {
		const { runner, getConfig } = createRunner(
			{ grading: [GOOGLE_FLASH], ocr: [GOOGLE_FLASH] },
			{ grading: [OPENAI_GPT4O] },
		)

		await runner.call("grading", async () => "a")
		await runner.call("ocr", async () => "b")

		expect(getConfig).toHaveBeenCalledTimes(1)
		expect(getConfig).toHaveBeenCalledWith("ocr")
	})

	it("toSnapshot() returns Zod-valid data", async () => {
		const { runner } = createRunner({ grading: [GOOGLE_FLASH] })
		await runner.call("grading", async () => "result")

		const parsed = LlmRunSnapshotSchema.safeParse(runner.toSnapshot())
		expect(parsed.success).toBe(true)
	})

	it("toSnapshot() returns a deep clone", async () => {
		const { runner } = createRunner({ grading: [GOOGLE_FLASH] })
		await runner.call("grading", async () => "result")

		const snap1 = runner.toSnapshot()
		snap1.effective.grading = {
			total_calls: 999,
			fallback_calls: 999,
			prompt_tokens: 999,
			completion_tokens: 999,
		}

		expect(runner.toSnapshot().effective.grading).toEqual(eff(1, 0))
	})

	// ── Token usage reporting ─────────────────────────────────────────────

	it("accumulates token usage when report.usage is set", async () => {
		const { runner } = createRunner({ grading: [GOOGLE_FLASH] })

		await runner.call("grading", async (_model, _entry, report) => {
			report.usage = { inputTokens: 100, outputTokens: 50 }
			return "a"
		})
		await runner.call("grading", async (_model, _entry, report) => {
			report.usage = { inputTokens: 200, outputTokens: 80 }
			return "b"
		})

		const snapshot = runner.toSnapshot()
		expect(snapshot.effective.grading).toEqual({
			total_calls: 2,
			fallback_calls: 0,
			prompt_tokens: 300,
			completion_tokens: 130,
		})
	})

	it("handles calls with no usage reported", async () => {
		const { runner } = createRunner({ grading: [GOOGLE_FLASH] })

		// First call reports usage, second doesn't
		await runner.call("grading", async (_model, _entry, report) => {
			report.usage = { inputTokens: 100, outputTokens: 50 }
			return "a"
		})
		await runner.call("grading", async () => "b")

		const snapshot = runner.toSnapshot()
		expect(snapshot.effective.grading).toEqual({
			total_calls: 2,
			fallback_calls: 0,
			prompt_tokens: 100,
			completion_tokens: 50,
		})
	})

	// ── Wall-clock timeout ────────────────────────────────────────────────

	it("rejects with LlmTimeoutError when fn exceeds timeoutMs", async () => {
		const { runner } = createRunner({ grading: [GOOGLE_FLASH] })

		await expect(
			runner.call(
				"grading",
				() => new Promise(() => {}), // never resolves, ignores signal
				{ timeoutMs: 50 },
			),
		).rejects.toBeInstanceOf(LlmTimeoutError)
	})

	it("aborts the AbortSignal when the timeout fires", async () => {
		const { runner } = createRunner({ grading: [GOOGLE_FLASH] })

		let observedSignal: AbortSignal | null = null
		await runner
			.call(
				"grading",
				async (_m, _e, _r, signal) => {
					observedSignal = signal
					return new Promise(() => {}) // never resolves
				},
				{ timeoutMs: 50 },
			)
			.catch(() => {})

		expect(observedSignal).not.toBeNull()
		expect((observedSignal as unknown as AbortSignal).aborted).toBe(true)
	})

	it("rewrites SDK AbortError to LlmTimeoutError when our timeout caused the abort", async () => {
		const { runner } = createRunner({ grading: [GOOGLE_FLASH] })

		// Simulate the AI SDK rejecting with a generic AbortError once it sees
		// the signal go aborted. Our wrapper should still surface a typed
		// LlmTimeoutError so callers can branch on it.
		await expect(
			runner.call(
				"grading",
				(_m, _e, _r, signal) =>
					new Promise((_, reject) => {
						signal.addEventListener("abort", () => {
							const err = new Error("The operation was aborted.")
							err.name = "AbortError"
							reject(err)
						})
					}),
				{ timeoutMs: 30 },
			),
		).rejects.toBeInstanceOf(LlmTimeoutError)
	})

	it("does not time out fast-resolving calls", async () => {
		const { runner } = createRunner({ grading: [GOOGLE_FLASH] })

		const result = await runner.call(
			"grading",
			async () => "fast",
			{ timeoutMs: 1000 },
		)

		expect(result).toBe("fast")
	})

	it("falls back to the next model after a timeout", async () => {
		const { runner } = createRunner({
			grading: [GOOGLE_FLASH, OPENAI_GPT4O],
		})

		let calls = 0
		const result = await runner.call(
			"grading",
			async (model) => {
				calls++
				if (
					(model as unknown as { modelId: string }).modelId.includes("google")
				) {
					return new Promise(() => {}) // hang on primary
				}
				return "fallback-result"
			},
			{ timeoutMs: 30 },
		)

		expect(result).toBe("fallback-result")
		expect(calls).toBe(2)
		expect(runner.toSnapshot().effective.grading).toEqual(eff(1, 1))
	})

	it("LlmTimeoutError carries callSiteKey and timeoutMs", async () => {
		const { runner } = createRunner({ grading: [GOOGLE_FLASH] })

		try {
			await runner.call(
				"grading",
				() => new Promise(() => {}),
				{ timeoutMs: 25 },
			)
			throw new Error("expected timeout")
		} catch (err) {
			expect(err).toBeInstanceOf(LlmTimeoutError)
			expect((err as LlmTimeoutError).callSiteKey).toBe("grading")
			expect((err as LlmTimeoutError).timeoutMs).toBe(25)
		}
	})

	it("emits a structured llm-timeout warn when the timeout fires", async () => {
		const { runner, logger } = createRunner({ grading: [GOOGLE_FLASH] })

		await runner
			.call(
				"grading",
				() => new Promise(() => {}),
				{ timeoutMs: 30 },
			)
			.catch(() => {})

		expect(logger.warn).toHaveBeenCalledWith(
			"llm-timeout",
			expect.stringContaining("exceeded wall-clock budget"),
			expect.objectContaining({ callSiteKey: "grading", timeoutMs: 30 }),
		)
	})

	it("DEFAULT_LLM_TIMEOUT_MS is exported and reasonable", () => {
		expect(DEFAULT_LLM_TIMEOUT_MS).toBeGreaterThan(10_000)
		expect(DEFAULT_LLM_TIMEOUT_MS).toBeLessThanOrEqual(300_000)
	})

	it("captures usage from fallback model", async () => {
		const { runner } = createRunner({
			grading: [GOOGLE_FLASH, OPENAI_GPT4O],
		})

		await runner.call("grading", async (model, _entry, report) => {
			if (
				(model as unknown as { modelId: string }).modelId.includes("google")
			) {
				throw new Error("fail")
			}
			report.usage = { inputTokens: 500, outputTokens: 200 }
			return "ok"
		})

		const snapshot = runner.toSnapshot()
		expect(snapshot.effective.grading).toEqual({
			total_calls: 1,
			fallback_calls: 1,
			prompt_tokens: 500,
			completion_tokens: 200,
		})
	})

	// ── timeoutMs as a thunk (per-attempt re-evaluation) ─────────────────────

	it("evaluates a timeoutMs thunk once per attempt", async () => {
		const { runner } = createRunner({ grading: [GOOGLE_FLASH] })
		const thunk = vi.fn(() => 1_000)

		await runner.call("grading", async () => "ok", { timeoutMs: thunk })
		expect(thunk).toHaveBeenCalledTimes(1)
	})

	it("re-evaluates the timeoutMs thunk for each fallback attempt", async () => {
		// Simulates a Lambda envelope: attempt 1 sees a comfortable budget,
		// attempt 2 sees a tighter budget because wall-clock has advanced.
		const { runner } = createRunner({
			grading: [GOOGLE_FLASH, OPENAI_GPT4O],
		})
		const thunk = vi
			.fn<() => number>()
			.mockReturnValueOnce(30)
			.mockReturnValueOnce(2_000)

		const result = await runner.call(
			"grading",
			async (model) => {
				if (
					(model as unknown as { modelId: string }).modelId.includes("google")
				) {
					// Primary hangs — the thunk's first call (30 ms) triggers
					// the timeout and the fallback chain advances.
					return new Promise<string>(() => {})
				}
				return "fallback"
			},
			{ timeoutMs: thunk },
		)

		expect(result).toBe("fallback")
		expect(thunk).toHaveBeenCalledTimes(2)
	})

	it("clampLlmTimeoutMs takes the min of a hard cap and the caller budget", () => {
		// number sources
		expect(clampLlmTimeoutMs(200, undefined)).toBe(200)
		expect(clampLlmTimeoutMs(200, 100)).toBe(100)
		expect(clampLlmTimeoutMs(200, 500)).toBe(200)

		// thunk source — clamp wraps the thunk so each evaluation re-clamps
		let remaining = 500
		const result = clampLlmTimeoutMs(200, () => remaining)
		expect(typeof result).toBe("function")
		expect((result as () => number)()).toBe(200)
		remaining = 150
		expect((result as () => number)()).toBe(150)
		remaining = 5
		expect((result as () => number)()).toBe(5)
	})
})

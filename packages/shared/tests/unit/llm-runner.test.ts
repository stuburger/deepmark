import type { LanguageModel } from "ai"
import { describe, expect, it, vi } from "vitest"
import { LlmRunSnapshotSchema, LlmRunner } from "../../src/llm/runner"
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
	const runner = new LlmRunner({ getConfig, resolveModel }, overrides)
	return { runner, getConfig, resolveModel }
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
})
